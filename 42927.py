from datamodel import OrderDepth, UserId, TradingState, Order
from typing import List, Dict
import json

class Trader:
    def __init__(self):
        # Asset-specific parameters
        self.asset_config = {
            "TOMATOES": {
                "position_limit": 20,
                "base_spread": 2,  # Absolute spread
                "volatility_multiplier": 1.2,  # More volatile
                "mean_reversion_weight": 0.4,
                "max_history": 15
            },
            "EMERALDS": {
                "position_limit": 20,
                "base_spread": 3,  # Slightly wider
                "volatility_multiplier": 0.8,  # More stable
                "mean_reversion_weight": 0.3,
                "max_history": 15
            },
            "PEARLS": {
                "position_limit": 20,
                "base_spread": 1,
                "volatility_multiplier": 1.0,
                "mean_reversion_weight": 0.3,
                "max_history": 10
            },
            "BANANAS": {
                "position_limit": 20,
                "base_spread": 1,
                "volatility_multiplier": 1.0,
                "mean_reversion_weight": 0.3,
                "max_history": 10
            }
        }
        
        self.price_history = {}
        self.volatility_estimate = {}
    
    def bid(self):
        """Required for Round 2"""
        return 15
    
    def get_asset_config(self, product: str) -> dict:
        """Get configuration for specific asset"""
        return self.asset_config.get(product, self.asset_config["PEARLS"])
    
    def calculate_mid_price(self, order_depth: OrderDepth) -> float:
        """Calculate mid price from order book"""
        if len(order_depth.buy_orders) == 0 or len(order_depth.sell_orders) == 0:
            return None
        
        best_bid = max(order_depth.buy_orders.keys())
        best_ask = min(order_depth.sell_orders.keys())
        return (best_bid + best_ask) / 2
    
    def estimate_volatility(self, product: str, order_depth: OrderDepth) -> float:
        """Estimate volatility from bid-ask spread and price history"""
        if len(order_depth.buy_orders) == 0 or len(order_depth.sell_orders) == 0:
            return 1.0
        
        best_bid = max(order_depth.buy_orders.keys())
        best_ask = min(order_depth.sell_orders.keys())
        spread = best_ask - best_bid
        mid_price = (best_bid + best_ask) / 2
        
        # Spread as percentage of mid price
        spread_pct = spread / mid_price if mid_price > 0 else 0
        
        # Historical volatility if available
        if product in self.price_history and len(self.price_history[product]) > 5:
            prices = self.price_history[product][-10:]
            mean_price = sum(prices) / len(prices)
            variance = sum((p - mean_price) ** 2 for p in prices) / len(prices)
            price_volatility = (variance ** 0.5) / mean_price if mean_price > 0 else 0
            return max(spread_pct, price_volatility)
        
        return spread_pct
    
    def calculate_fair_value(self, product: str, order_depth: OrderDepth) -> float:
        """Calculate fair value with asset-specific adjustments"""
        mid = self.calculate_mid_price(order_depth)
        
        if mid is None:
            return None
        
        config = self.get_asset_config(product)
        
        # Initialize price history for this product
        if product not in self.price_history:
            self.price_history[product] = []
        
        self.price_history[product].append(mid)
        if len(self.price_history[product]) > config["max_history"]:
            self.price_history[product].pop(0)
        
        # Weighted average with mean reversion tendency
        if len(self.price_history[product]) > 3:
            avg_price = sum(self.price_history[product]) / len(self.price_history[product])
            mr_weight = config["mean_reversion_weight"]
            fair_value = (mid * (1 - mr_weight) + avg_price * mr_weight)
        else:
            fair_value = mid
        
        return fair_value
    
    def calculate_adaptive_spread(self, product: str, order_depth: OrderDepth) -> int:
        """Calculate spread based on asset volatility and characteristics"""
        config = self.get_asset_config(product)
        mid = self.calculate_mid_price(order_depth)
        
        if mid is None:
            return config["base_spread"]
        
        # Estimate volatility
        volatility = self.estimate_volatility(product, order_depth)
        
        # Get bid-ask spread from order book
        if len(order_depth.buy_orders) > 0 and len(order_depth.sell_orders) > 0:
            best_bid = max(order_depth.buy_orders.keys())
            best_ask = min(order_depth.sell_orders.keys())
            market_spread = best_ask - best_bid
        else:
            market_spread = 20  # Default if can't calculate
        
        # Adaptive spread: base spread adjusted by volatility and market conditions
        spread = max(
            config["base_spread"],
            int(market_spread * 0.5) + 1,  # React to market spread
            int(volatility * 500 * config["volatility_multiplier"])  # Volatility-based
        )
        
        return spread
    
    def execute_market_making(self, product: str, order_depth: OrderDepth, 
                             fair_value: float, current_position: int) -> List[Order]:
        """Execute asset-adapted market making strategy"""
        orders = []
        config = self.get_asset_config(product)
        position_limit = config["position_limit"]
        
        mid = self.calculate_mid_price(order_depth)
        if mid is None:
            return orders
        
        # Get adaptive spread
        spread = self.calculate_adaptive_spread(product, order_depth)
        
        # Calculate volume-weighted order sizing based on market depth
        buy_volume_available = sum(abs(vol) for vol in order_depth.sell_orders.values())
        sell_volume_available = sum(vol for vol in order_depth.buy_orders.values())
        max_buy_qty = min(buy_volume_available, position_limit - current_position) if current_position < position_limit else 0
        max_sell_qty = min(sell_volume_available, position_limit + current_position) if current_position > -position_limit else 0
        
        # BUY LOGIC: Buy when price is low relative to fair value
        if len(order_depth.sell_orders) > 0:
            best_ask = min(order_depth.sell_orders.keys())
            ask_volume = abs(order_depth.sell_orders[best_ask])
            
            # Immediate fill if ask is significantly below fair value
            if best_ask < fair_value and current_position < position_limit:
                buy_quantity = min(ask_volume, max_buy_qty, position_limit - current_position)
                if buy_quantity > 0:
                    print(f"BUY {product}: {buy_quantity}x @ {best_ask} (fair: {fair_value:.1f})")
                    orders.append(Order(product, best_ask, buy_quantity))
                    current_position += buy_quantity
            
            # Place limit buy orders at fair value - spread if we're not at limit
            if current_position < position_limit * 0.8 and spread > 0:
                limit_buy_price = int(fair_value - spread)
                limit_buy_qty = min(10, position_limit - current_position)
                if limit_buy_qty > 0 and limit_buy_price > 0:
                    orders.append(Order(product, limit_buy_price, limit_buy_qty))
                    current_position += limit_buy_qty
        
        # SELL LOGIC: Sell when price is high relative to fair value
        if len(order_depth.buy_orders) > 0:
            best_bid = max(order_depth.buy_orders.keys())
            bid_volume = order_depth.buy_orders[best_bid]
            
            # Immediate fill if bid is significantly above fair value
            if best_bid > fair_value and current_position > -position_limit:
                sell_quantity = min(bid_volume, max_sell_qty, position_limit + current_position)
                if sell_quantity > 0:
                    print(f"SELL {product}: {sell_quantity}x @ {best_bid} (fair: {fair_value:.1f})")
                    orders.append(Order(product, best_bid, -sell_quantity))
                    current_position -= sell_quantity
            
            # Place limit sell orders at fair value + spread if we're not at limit
            if current_position > -position_limit * 0.8 and spread > 0:
                limit_sell_price = int(fair_value + spread)
                limit_sell_qty = min(10, position_limit + current_position)
                if limit_sell_qty > 0:
                    orders.append(Order(product, limit_sell_price, -limit_sell_qty))
                    current_position -= limit_sell_qty
        
        return orders
    
    def run(self, state: TradingState):
        """Main trading logic called each iteration"""
        
        print("=" * 50)
        print(f"Timestamp: {state.timestamp}")
        
        # Parse trader data for historical state
        try:
            if state.traderData and state.traderData != "":
                trader_state = json.loads(state.traderData)
                self.price_history = trader_state.get("price_history", self.price_history)
        except Exception as e:
            print(f"Error parsing traderData: {e}")
            pass
        
        result = {}
        
        # Trade each product
        for product in state.order_depths:
            order_depth = state.order_depths[product]
            
            # Calculate fair value
            mid_price = self.calculate_mid_price(order_depth)
            if mid_price is None:
                result[product] = []
                continue
            
            fair_value = self.calculate_fair_value(product, order_depth)
            
            # Get current position from state.position dictionary
            current_position = state.position.get(product, 0)
            
            # Get config for this product
            config = self.get_asset_config(product)
            spread = self.calculate_adaptive_spread(product, order_depth)
            
            print(f"\n{product}:")
            print(f"  Mid Price: {mid_price:.2f}, Fair Value: {fair_value:.2f}")
            print(f"  Position: {current_position}, Spread Budget: {spread} ticks")
            print(f"  Bid/Ask Depth: {len(order_depth.buy_orders)}/{len(order_depth.sell_orders)}")
            
            # Execute trading strategy
            orders = self.execute_market_making(product, order_depth, fair_value, current_position)
            result[product] = orders
        
        # Save state for next iteration
        traderData = json.dumps({
            "price_history": self.price_history
        })
        
        conversions = 0
        
        return result, conversions, traderData