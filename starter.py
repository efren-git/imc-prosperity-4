from prosperity4mcbt.datamodel import OrderDepth, TradingState, Order
from typing import List, Dict

# Self-cap 20: strong tutorial backtests; official round may use 80 — adjust then.
POSITION_LIMITS: Dict[str, int] = {
    "EMERALDS": 20,
    "TOMATOES": 20,
}
DEFAULT_POSITION_LIMIT = 20


class Trader:
    """
    Baseline MM (mid, spread//4, tick skew). One tweak: size 6 when nearly flat, 5 otherwise.
    """

    def run(self, state: TradingState):
        result: Dict[str, List[Order]] = {}
        trader_data = state.traderData if state.traderData is not None else ""

        for product in state.order_depths:
            depth: OrderDepth = state.order_depths[product]
            orders: List[Order] = []

            if not depth.buy_orders or not depth.sell_orders:
                result[product] = []
                continue

            best_bid = max(depth.buy_orders.keys())
            best_ask = min(depth.sell_orders.keys())
            if best_bid >= best_ask:
                result[product] = []
                continue

            pos = state.position.get(product, 0)
            limit = POSITION_LIMITS.get(product, DEFAULT_POSITION_LIMIT)

            mid = (best_bid + best_ask) / 2.0
            spread = best_ask - best_bid
            edge = max(1, spread // 4)

            skew = 0
            if pos > limit // 2:
                skew = max(1, spread // 8)
            elif pos < -limit // 2:
                skew = -max(1, spread // 8)

            bid_px = int(round(mid - edge - skew))
            ask_px = int(round(mid + edge - skew))

            bid_px = min(bid_px, best_ask - 1)
            ask_px = max(ask_px, best_bid + 1)
            bid_px = max(bid_px, best_bid - 1)
            ask_px = min(ask_px, best_ask + 1)

            order_size = 6 if abs(pos) <= 5 else 5
            room_buy = limit - pos
            room_sell = limit + pos

            if room_buy > 0 and bid_px < best_ask:
                qty = min(order_size, room_buy)
                if qty > 0:
                    orders.append(Order(product, bid_px, qty))

            if room_sell > 0 and ask_px > best_bid:
                qty = min(order_size, room_sell)
                if qty > 0:
                    orders.append(Order(product, ask_px, -qty))

            result[product] = orders

        conversions = 0
        return result, conversions, trader_data