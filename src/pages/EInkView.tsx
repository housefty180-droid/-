import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { FridgeItem } from '../types';
import { differenceInDays, startOfDay } from 'date-fns';

export const EInkView: React.FC = () => {
  const [items, setItems] = useState<FridgeItem[]>([]);
  const guestUid = 'guest_user_default';

  useEffect(() => {
    const q = query(
      collection(db, 'items'),
      where('userId', '==', guestUid),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems: FridgeItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedItems.push({
          id: doc.id,
          ...data,
          expiryDate: data.expiryDate?.toDate(),
        } as FridgeItem);
      });
      
      // 排序：快过期的排在前面
      setItems(fetchedItems.sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.getTime() - b.expiryDate.getTime();
      }).slice(0, 20)); // 增加到20个，分两列显示
    });

    return () => unsubscribe();
  }, []);

  // 将数组分成两半
  const leftColumn = items.slice(0, 10);
  const rightColumn = items.slice(10, 20);

  const renderItem = (item: FridgeItem, index: number, offset: number) => {
    const days = item.expiryDate 
      ? differenceInDays(startOfDay(item.expiryDate), startOfDay(new Date())) 
      : null;
    
    return (
      <div key={item.id} style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        padding: '4px 0', 
        borderBottom: '1px solid #ccc',
        fontSize: '14px'
      }}>
        <span style={{ fontWeight: 'bold', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '120px' }}>
          {index + 1 + offset}. {item.name}
        </span>
        <span style={{ fontSize: '12px', marginLeft: '5px' }}>
          {days === null ? '--' : days < 0 ? '!' : days === 0 ? '0d' : `${days}d`}
        </span>
      </div>
    );
  };

  return (
    <div style={{ 
      width: '400px', 
      height: '300px', 
      backgroundColor: 'white', 
      color: 'black', 
      padding: '15px',
      fontFamily: '"Courier New", Courier, monospace',
      border: '1px solid black',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box'
    }}>
      <div style={{ borderBottom: '2px solid black', paddingBottom: '5px', marginBottom: '10px', display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '20px', fontWeight: 'black' }}>FRIDGE INVENTORY</span>
        <span style={{ fontSize: '10px' }}>{new Date().toLocaleString()}</span>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '20px' }}>
        <div style={{ flex: 1 }}>
          {leftColumn.map((item, index) => renderItem(item, index, 0))}
        </div>
        <div style={{ flex: 1, borderLeft: '1px dashed black', paddingLeft: '10px' }}>
          {rightColumn.map((item, index) => renderItem(item, index, 10))}
        </div>
      </div>

      <div style={{ marginTop: '5px', fontSize: '9px', textAlign: 'center', opacity: 0.7 }}>
        Total: {items.length} items | ESP32-Link Active
      </div>
    </div>
  );
};
