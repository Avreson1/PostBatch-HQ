// src/context/OrderContext.jsx
import React, { createContext, useContext, useState } from 'react';
import { initialOrders } from '../data/seedOrders';

const OrderContext = createContext();

export function OrderProvider({ children }) {
  const [orders, setOrders] = useState(initialOrders);

  const addOrder = (newOrder) => {
    setOrders((prev) => [newOrder, ...prev]);
  };

  return (
    <OrderContext.Provider value={{ orders, addOrder }}>
      {children}
    </OrderContext.Provider>
  );
}

export const useOrders = () => useContext(OrderContext);