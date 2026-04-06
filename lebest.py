from datamodel import OrderDepth, TradingState, Order
from typing import List, Dict
import json


class Trader:
    # ── EMERALDS (StaticTrader logic from frankfurt_hedge.py) ────────────────
    EMERALDS_LIMIT = 80

    # ── TOMATOES (upload_v9c_mr_cap_only.py) ─────────────────────────────────
    TOMATOES_SKEW_FACTOR = 0.1
    TOMATOES_LIMIT = 80
    TOMATOES_OFI_ALPHA = 2.0
    TOMATOES_MEAN_REV_BETA = 0.1
    TOMATOES_MEAN_REV_CAP = 4.0
    TOMATOES_MOMENTUM_WINDOW = 10
    TOMATOES_LAYERS = [
        {"offset": 5, "size": 20},
        {"offset": 7, "size": 15},
        {"offset": 9, "size": 10},
    ]

    def run(self, state: TradingState):
        result: Dict[str, List[Order]] = {}
        td = self._ld(state.traderData)
        if "EMERALDS" in state.order_depths:
            result["EMERALDS"] = self._em(state)
        if "TOMATOES" in state.order_depths:
            result["TOMATOES"] = self._tom(state, td)
        for p in state.order_depths:
            if p not in result:
                result[p] = []
        return result, 0, json.dumps(td)

    # ── EMERALDS: dynamic wall-based market making ───────────────────────────
    def _em(self, state):
        p = "EMERALDS"
        od = state.order_depths[p]
        pos = state.position.get(p, 0)
        lim = self.EMERALDS_LIMIT
        orders = []

        buy_orders = {bp: abs(bv) for bp, bv in
                      sorted(od.buy_orders.items(), key=lambda x: x[0], reverse=True)}
        sell_orders = {sp: abs(sv) for sp, sv in
                       sorted(od.sell_orders.items(), key=lambda x: x[0])}

        if not buy_orders or not sell_orders:
            return orders

        # Walls: outermost bid and ask in the book
        bid_wall = min(buy_orders)
        ask_wall = max(sell_orders)
        wall_mid = (bid_wall + ask_wall) / 2.0

        max_buy = lim - pos
        max_sell = lim + pos

        # 1. TAKING — lift anything mispriced vs wall_mid
        for sp, sv in sell_orders.items():
            if max_buy <= 0:
                break
            if sp <= wall_mid - 1:
                vol = min(sv, max_buy)
                orders.append(Order(p, sp, vol))
                max_buy -= vol
            elif sp <= wall_mid and pos < 0:
                vol = min(sv, abs(pos), max_buy)
                if vol > 0:
                    orders.append(Order(p, sp, vol))
                    max_buy -= vol

        for bp, bv in buy_orders.items():
            if max_sell <= 0:
                break
            if bp >= wall_mid + 1:
                vol = min(bv, max_sell)
                orders.append(Order(p, bp, -vol))
                max_sell -= vol
            elif bp >= wall_mid and pos > 0:
                vol = min(bv, pos, max_sell)
                if vol > 0:
                    orders.append(Order(p, bp, -vol))
                    max_sell -= vol

        # 2. MAKING — post just inside the spread, overbid/underbid best resting order
        bid_price = int(bid_wall + 1)
        ask_price = int(ask_wall - 1)

        for bp, bv in buy_orders.items():
            overbid = bp + 1
            if bv > 1 and overbid < wall_mid:
                bid_price = max(bid_price, overbid)
                break
            elif bp < wall_mid:
                bid_price = max(bid_price, bp)
                break

        for sp, sv in sell_orders.items():
            underbid = sp - 1
            if sv > 1 and underbid > wall_mid:
                ask_price = min(ask_price, underbid)
                break
            elif sp > wall_mid:
                ask_price = min(ask_price, sp)
                break

        if max_buy > 0:
            orders.append(Order(p, bid_price, max_buy))
        if max_sell > 0:
            orders.append(Order(p, ask_price, -max_sell))

        return orders

    # ── TOMATOES: micro_price + OFI + momentum mean-reversion + layers ───────
    @staticmethod
    def _popular_fair(od):
        pop_bid = pop_ask = None
        max_bv = max_av = 0
        for price, vol in od.buy_orders.items():
            if vol > max_bv:
                max_bv = vol
                pop_bid = price
        for price, vol in od.sell_orders.items():
            v = abs(vol)
            if v > max_av:
                max_av = v
                pop_ask = price
        if pop_bid is not None and pop_ask is not None:
            return (pop_bid + pop_ask) / 2.0
        return None

    def _tom(self, state, td):
        p = "TOMATOES"
        od = state.order_depths[p]
        pos = state.position.get(p, 0)
        orders = []
        lim = self.TOMATOES_LIMIT

        bb = max(od.buy_orders) if od.buy_orders else None
        ba = min(od.sell_orders) if od.sell_orders else None
        if bb is None or ba is None:
            return orders

        bv1 = od.buy_orders[bb]
        av1 = abs(od.sell_orders[ba])
        mid = (bb + ba) / 2.0
        top = bv1 + av1
        micro = (bb * av1 + ba * bv1) / top if top > 0 else mid

        tbv = sum(od.buy_orders.values())
        tav = sum(abs(v) for v in od.sell_orders.values())
        tv = tbv + tav
        ofi = (tbv - tav) / tv if tv > 0 else 0.0

        pfair = self._popular_fair(od)
        base = 0.5 * micro + 0.5 * pfair if pfair is not None else micro
        fair = base + self.TOMATOES_OFI_ALPHA * ofi

        ph = td.get("tp", [])
        ph.append(mid)
        if len(ph) > 20:
            ph = ph[-20:]
        td["tp"] = ph

        w = self.TOMATOES_MOMENTUM_WINDOW
        mom = ph[-1] - ph[-1 - w] if len(ph) > w else 0.0
        mr = -self.TOMATOES_MEAN_REV_BETA * mom
        mr = max(-self.TOMATOES_MEAN_REV_CAP, min(self.TOMATOES_MEAN_REV_CAP, mr))
        fair += mr

        bc = lim - pos
        sc = lim + pos

        for ap in sorted(od.sell_orders):
            if ap < fair - 0.5 and bc > 0:
                q = min(abs(od.sell_orders[ap]), bc)
                if q > 0:
                    orders.append(Order(p, ap, q))
                    pos += q
                    bc -= q

        for bp in sorted(od.buy_orders, reverse=True):
            if bp > fair + 0.5 and sc > 0:
                q = min(od.buy_orders[bp], sc)
                if q > 0:
                    orders.append(Order(p, bp, -q))
                    pos -= q
                    sc -= q

        skew = -pos * self.TOMATOES_SKEW_FACTOR
        adj = fair + skew
        for ly in self.TOMATOES_LAYERS:
            bs = min(ly["size"], bc)
            ss = min(ly["size"], sc)
            if bs > 0:
                orders.append(Order(p, int(round(adj - ly["offset"])), bs))
                bc -= bs
            if ss > 0:
                orders.append(Order(p, int(round(adj + ly["offset"])), -ss))
                sc -= ss

        return orders

    @staticmethod
    def _ld(s):
        if s and s.strip():
            try:
                return json.loads(s)
            except:
                pass
        return {}