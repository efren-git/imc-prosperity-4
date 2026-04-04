from datamodel import OrderDepth, TradingState, Order
from typing import List, Dict
import json

class Trader:
    # V5: Combined best — popular fair + tight L1 + aggressive taking
    EMERALDS_SKEW_FACTOR = 0.4
    EMERALDS_LIMIT = 80
    EMERALDS_LAYERS = [
        {"offset": 4, "size": 20},   # Tight L1 (from V1 insight)
        {"offset": 5, "size": 15},
        {"offset": 7, "size": 15},
    ]

    TOMATOES_SKEW_FACTOR = 0.4
    TOMATOES_LIMIT = 80
    TOMATOES_OFI_ALPHA = 2.0
    TOMATOES_MEAN_REV_BETA = 0.3
    TOMATOES_MOMENTUM_WINDOW = 5
    TOMATOES_LAYERS = [
        {"offset": 3, "size": 20},   # Tight L1 (from V1)
        {"offset": 5, "size": 15},
        {"offset": 7, "size": 10},
    ]

    def run(self, state: TradingState):
        result: Dict[str, List[Order]] = {}
        td = self._ld(state.traderData)
        if "EMERALDS" in state.order_depths:
            result["EMERALDS"] = self._em(state, td)
        if "TOMATOES" in state.order_depths:
            result["TOMATOES"] = self._tom(state, td)
        for p in state.order_depths:
            if p not in result: result[p] = []
        return result, 0, json.dumps(td)

    @staticmethod
    def _popular_fair(od):
        pop_bid = pop_ask = None; max_bv = max_av = 0
        for price, vol in od.buy_orders.items():
            if vol > max_bv: max_bv = vol; pop_bid = price
        for price, vol in od.sell_orders.items():
            v = abs(vol)
            if v > max_av: max_av = v; pop_ask = price
        if pop_bid is not None and pop_ask is not None:
            return (pop_bid + pop_ask) / 2.0
        return None

    def _em(self, state, td):
        p = "EMERALDS"; od = state.order_depths[p]; pos = state.position.get(p, 0)
        orders = []; lim = self.EMERALDS_LIMIT
        # Popular fair value (from V3)
        pfair = self._popular_fair(od)
        fair = pfair if pfair is not None else 10000
        bc = lim - pos; sc = lim + pos
        # Aggressive taking (from V2) — take all below fair
        if od.sell_orders:
            for ap in sorted(od.sell_orders):
                if ap < fair and bc > 0:
                    q = min(abs(od.sell_orders[ap]), bc)
                    if q > 0: orders.append(Order(p, ap, q)); pos += q; bc -= q
        if od.buy_orders:
            for bp in sorted(od.buy_orders, reverse=True):
                if bp > fair and sc > 0:
                    q = min(od.buy_orders[bp], sc)
                    if q > 0: orders.append(Order(p, bp, -q)); pos -= q; sc -= q
        skew = -pos * self.EMERALDS_SKEW_FACTOR; adj = fair + skew
        for ly in self.EMERALDS_LAYERS:
            bs = min(ly["size"], bc); ss = min(ly["size"], sc)
            if bs > 0: orders.append(Order(p, int(round(adj - ly["offset"])), bs)); bc -= bs
            if ss > 0: orders.append(Order(p, int(round(adj + ly["offset"])), -ss)); sc -= ss
        return orders

    def _tom(self, state, td):
        p = "TOMATOES"; od = state.order_depths[p]; pos = state.position.get(p, 0)
        orders = []; lim = self.TOMATOES_LIMIT
        bb = max(od.buy_orders) if od.buy_orders else None
        ba = min(od.sell_orders) if od.sell_orders else None
        if bb is None or ba is None: return orders
        bv1 = od.buy_orders[bb]; av1 = abs(od.sell_orders[ba]); mid = (bb + ba) / 2.0
        top = bv1 + av1; micro = (bb * av1 + ba * bv1) / top if top > 0 else mid
        tbv = sum(od.buy_orders.values()); tav = sum(abs(v) for v in od.sell_orders.values())
        tv = tbv + tav; ofi = (tbv - tav) / tv if tv > 0 else 0.0
        # Popular fair blended with microprice (from V3)
        pfair = self._popular_fair(od)
        base = 0.5 * micro + 0.5 * pfair if pfair is not None else micro
        fair = base + self.TOMATOES_OFI_ALPHA * ofi
        ph = td.get("tp", []); ph.append(mid)
        if len(ph) > 20: ph = ph[-20:]
        td["tp"] = ph; mom = 0.0; w = self.TOMATOES_MOMENTUM_WINDOW
        if len(ph) > w: mom = ph[-1] - ph[-1 - w]
        fair += -self.TOMATOES_MEAN_REV_BETA * mom
        bc = lim - pos; sc = lim + pos
        # Aggressive taking threshold (from V2)
        if od.sell_orders:
            for ap in sorted(od.sell_orders):
                if ap < fair - 0.5 and bc > 0:
                    q = min(abs(od.sell_orders[ap]), bc)
                    if q > 0: orders.append(Order(p, ap, q)); pos += q; bc -= q
        if od.buy_orders:
            for bp in sorted(od.buy_orders, reverse=True):
                if bp > fair + 0.5 and sc > 0:
                    q = min(od.buy_orders[bp], sc)
                    if q > 0: orders.append(Order(p, bp, -q)); pos -= q; sc -= q
        skew = -pos * self.TOMATOES_SKEW_FACTOR; adj = fair + skew
        for ly in self.TOMATOES_LAYERS:
            bs = min(ly["size"], bc); ss = min(ly["size"], sc)
            if bs > 0: orders.append(Order(p, int(round(adj - ly["offset"])), bs)); bc -= bs
            if ss > 0: orders.append(Order(p, int(round(adj + ly["offset"])), -ss)); sc -= ss
        return orders

    @staticmethod
    def _ld(s):
        if s and s.strip():
            try: return json.loads(s)
            except: pass
        return {}