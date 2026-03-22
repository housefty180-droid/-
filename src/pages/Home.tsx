import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../AuthContext';
import { FridgeItem, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firestoreErrorHandler';
import { format, differenceInDays, isAfter, startOfDay } from 'date-fns';
import { CheckCircle, Trash2, Clock, Search, Plus, Minus, MoreVertical, Move, Check, X, AlertCircle, RefreshCw } from 'lucide-react';
import { PixelSnowflake, PixelIceCube, PixelBox } from '../components/PixelIcons';

import { motion, AnimatePresence } from 'motion/react';

export const Home: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'frozen' | 'refrigerated' | 'room_temp'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Manual quantity input
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');

  // Item menu
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Pull to refresh
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  // Reset state on mount
  useEffect(() => {
    setPullY(0);
    setIsPulling(false);
    setIsRefreshing(false);
    setActiveMenuId(null);
  }, []);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        setIsPulling(true);
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling) return;
      const touch = e.touches[0];
      // Simple pull logic
      if (touch.clientY > 100) {
        setPullY(Math.min((touch.clientY - 100) / 2, 80));
      }
    };
    
    const handleTouchEnd = () => {
      if (pullY > 50) {
        setIsRefreshing(true);
        // In a real app, we'd trigger a refetch here. 
        // Since we use onSnapshot, it's already real-time, 
        // but we can simulate a refresh for UX.
        setTimeout(() => setIsRefreshing(false), 1000);
      }
      setIsPulling(false);
      setPullY(0);
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPulling, pullY]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'items'),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedItems: FridgeItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          fetchedItems.push({
            id: doc.id,
            ...data,
            addedDate: data.addedDate?.toDate(),
            expiryDate: data.expiryDate?.toDate(),
            lastModified: data.lastModified?.toDate(),
          } as FridgeItem);
        });
        setItems(fetchedItems.sort((a, b) => {
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return a.expiryDate.getTime() - b.expiryDate.getTime();
        }));
        setIsRefreshing(false);
      },
      (error: any) => {
        if (error.code === 'permission-denied' && !auth.currentUser) return;
        handleFirestoreError(error, OperationType.LIST, 'items');
        setIsRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleUpdateStatus = async (itemId: string, status: 'consumed' | 'discarded') => {
    try {
      await updateDoc(doc(db, 'items', itemId), { 
        status,
        lastModified: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const handleUpdateQuantity = async (itemId: string, delta: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const newQuantity = Math.max(0, (item.quantity || 0) + delta);
    
    if (newQuantity === 0) {
      if (window.confirm(`"${item.name}" 数量已归零，是否标记为已食用？`)) {
        handleUpdateStatus(itemId, 'consumed');
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'items', itemId), { 
        quantity: newQuantity,
        lastModified: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const handleManualQuantity = async (itemId: string) => {
    const val = parseFloat(editQuantityValue);
    if (isNaN(val) || val < 0) return;

    try {
      await updateDoc(doc(db, 'items', itemId), { 
        quantity: val,
        lastModified: serverTimestamp()
      });
      setEditingQuantityId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    if (newSelected.size === 0) setSelectionMode(false);
  };

  const handleBatchMove = async (targetCategory: 'frozen' | 'refrigerated' | 'room_temp') => {
    if (selectedIds.size === 0) return;
    
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.update(doc(db, 'items', id), { 
          category: targetCategory,
          lastModified: serverTimestamp()
        });
      });
      await batch.commit();
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'items/batch');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selectedIds.size} 个物品吗？`)) return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.update(doc(db, 'items', id), { 
          status: 'discarded',
          lastModified: serverTimestamp()
        });
      });
      await batch.commit();
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'items/batch');
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || item.category === filter;
    return matchesSearch && matchesFilter;
  });

  const getExpiryStatus = (date?: Date) => {
    if (!date) return { color: 'text-fridge-text-muted', bg: 'bg-black/5', cardBg: 'bg-white', cardBorder: 'border-black/5', text: '无保质期', alert: false };
    const days = differenceInDays(startOfDay(date), startOfDay(new Date()));
    
    if (days < 0) return { color: 'text-red-600', bg: 'bg-red-50', cardBg: 'bg-red-50/30', cardBorder: 'border-red-100', text: '已过期', alert: true };
    if (days === 0) return { color: 'text-red-600', bg: 'bg-red-50', cardBg: 'bg-red-50/30', cardBorder: 'border-red-100', text: '今天过期', alert: true };
    if (days <= 3) return { color: 'text-fridge-orange', bg: 'bg-fridge-orange/10', cardBg: 'bg-fridge-orange/5', cardBorder: 'border-fridge-orange/20', text: `${days}天后过期`, alert: true };
    if (days <= 7) return { color: 'text-fridge-green', bg: 'bg-fridge-green/10', cardBg: 'bg-white', cardBorder: 'border-fridge-green/20', text: `${days}天后过期`, alert: false };
    
    return { color: 'text-fridge-blue', bg: 'bg-fridge-blue/10', cardBg: 'bg-white', cardBorder: 'border-black/5', text: `${days}天后过期`, alert: false };
  };

  const getCategoryIcon = (cat: string, active: boolean = false) => {
    switch(cat) {
      case 'frozen': return <PixelIceCube className={`w-5 h-5 ${active ? 'text-white' : 'text-fridge-blue'}`} style={{ color: active ? '#fff' : 'var(--color-fridge-blue)' }} />;
      case 'refrigerated': return <PixelSnowflake className={`w-4 h-4 ${active ? 'text-white' : 'text-fridge-orange'}`} style={{ color: active ? '#fff' : 'var(--color-fridge-orange)' }} />;
      case 'room_temp': return <PixelBox className={`w-4 h-4 ${active ? 'text-white' : 'text-fridge-green'}`} style={{ color: active ? '#fff' : 'var(--color-fridge-green)' }} />;
      default: return '📦';
    }
  };

  const handleUpdateCategory = async (itemId: string, category: 'frozen' | 'refrigerated' | 'room_temp') => {
    try {
      await updateDoc(doc(db, 'items', itemId), { 
        category,
        lastModified: serverTimestamp()
      });
      setActiveMenuId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  const handleDiscardItem = async (itemId: string) => {
    if (!window.confirm('确定要丢弃这个食材吗？')) return;
    try {
      await updateDoc(doc(db, 'items', itemId), { 
        status: 'discarded',
        lastModified: serverTimestamp()
      });
      setActiveMenuId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${itemId}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-32 relative"
    >
      {/* Pull to Refresh Indicator */}
      <motion.div 
        style={{ height: pullY }}
        className="overflow-hidden flex items-center justify-center text-fridge-orange"
      >
        <RefreshCw size={24} className={isRefreshing ? 'animate-spin' : ''} style={{ transform: `rotate(${pullY * 2}deg)` }} />
      </motion.div>

      {/* Mobile App Bar */}
      <header className="md:hidden flex items-center justify-between py-2">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-fridge-text">我的冰箱</h1>
          <p className="text-[13px] font-bold text-fridge-text-muted mt-1">
            {items.length} 个食材正在保鲜
          </p>
        </div>
        <div className="flex gap-3">
          {selectionMode ? (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
              className="bg-black/5 p-3.5 rounded-full text-fridge-text"
            >
              <X size={20} />
            </motion.button>
          ) : (
            <motion.div 
              whileTap={{ scale: 0.9 }}
              className="bg-fridge-peach/30 p-3.5 rounded-full shadow-sm border border-fridge-peach/20"
            >
              <PixelSnowflake className="w-6 h-6 text-fridge-orange" style={{ color: 'var(--color-fridge-orange)' }} />
            </motion.div>
          )}
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div 
          whileTap={{ scale: 0.98 }}
          className="bg-fridge-blue/10 border border-fridge-blue/20 rounded-fridge p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-fridge-blue rounded-full flex items-center justify-center text-white shadow-lg shadow-fridge-blue/20">
              <PixelIceCube className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-black text-fridge-blue uppercase tracking-wider">即将过期</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-fridge-text">
              {items.filter(i => {
                const status = getExpiryStatus(i.expiryDate);
                return status.color === 'text-red-500' || status.color === 'text-orange-500';
              }).length}
            </span>
            <span className="text-sm font-bold text-fridge-text-muted">件</span>
          </div>
        </motion.div>

        <motion.div 
          whileTap={{ scale: 0.98 }}
          className="bg-fridge-green/10 border border-fridge-green/20 rounded-fridge p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-fridge-green rounded-full flex items-center justify-center text-white shadow-lg shadow-fridge-green/20">
              <PixelBox className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-black text-fridge-green uppercase tracking-wider">库存充足</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-fridge-text">
              {items.filter(i => getExpiryStatus(i.expiryDate).color === 'text-fridge-green').length}
            </span>
            <span className="text-sm font-bold text-fridge-text-muted">件</span>
          </div>
        </motion.div>
      </div>

      {/* Desktop Header */}
      <header className="hidden md:block">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-5xl font-black tracking-tight text-fridge-text">我的冰箱</h1>
            <p className="text-lg font-bold text-fridge-text-muted mt-2">管理您的库存并减少浪费。</p>
          </div>
          {selectionMode && (
            <div className="flex gap-3">
              <button onClick={handleBatchDelete} className="px-6 py-3 bg-red-50 text-red-600 rounded-full font-bold text-sm transition-all hover:bg-red-100">删除所选</button>
              <button onClick={() => handleBatchMove('refrigerated')} className="px-6 py-3 bg-fridge-orange/10 text-fridge-orange rounded-full font-bold text-sm transition-all hover:bg-fridge-orange/20">移至冷藏</button>
              <button onClick={() => handleBatchMove('frozen')} className="px-6 py-3 bg-fridge-blue/10 text-fridge-blue rounded-full font-bold text-sm transition-all hover:bg-fridge-blue/20">移至冷冻</button>
              <button onClick={() => handleBatchMove('room_temp')} className="px-6 py-3 bg-fridge-green/10 text-fridge-green rounded-full font-bold text-sm transition-all hover:bg-fridge-green/10">移至常温</button>
            </div>
          )}
        </div>
      </header>

      {/* Search and Filters */}
      <div className="sticky top-0 z-20 py-4 space-y-6">
        <div className="relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-fridge-text-muted group-focus-within:text-fridge-orange transition-colors" size={20} />
          <input
            type="text"
            placeholder="搜索物品..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-14 pr-6 py-4 bg-white rounded-fridge border-none shadow-sm focus:ring-2 focus:ring-fridge-orange/20 outline-none transition-all text-[17px] font-bold text-fridge-text placeholder:text-fridge-text-muted/50"
          />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {(['all', 'refrigerated', 'frozen', 'room_temp'] as const).map((cat) => (
            <motion.button
              key={cat}
              whileTap={{ scale: 0.96 }}
              onClick={() => setFilter(cat)}
              className={`px-6 py-3 rounded-full whitespace-nowrap font-bold transition-all text-[15px] ${
                filter === cat
                  ? 'bg-fridge-orange text-white shadow-lg shadow-fridge-orange/20'
                  : 'bg-white text-fridge-text-muted border border-black/5 hover:bg-fridge-peach/20'
              }`}
            >
              {cat === 'all' ? '全部' : cat === 'refrigerated' ? '冷藏' : cat === 'frozen' ? '冷冻' : '常温'}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Expiry Alerts */}
      <AnimatePresence>
        {items.some(i => getExpiryStatus(i.expiryDate).alert) && (
          <motion.div
            initial={{ height: 0, opacity: 0, scale: 0.95 }}
            animate={{ height: 'auto', opacity: 1, scale: 1 }}
            exit={{ height: 0, opacity: 0, scale: 0.95 }}
            className="bg-fridge-peach/20 border border-fridge-peach/30 rounded-fridge p-5 flex items-start gap-4"
          >
            <div className="w-10 h-10 bg-fridge-orange rounded-full flex items-center justify-center text-white shadow-lg shadow-fridge-orange/20 shrink-0">
              <AlertCircle size={22} />
            </div>
            <div>
              <h4 className="font-black text-fridge-text">保质期提醒</h4>
              <p className="text-fridge-text-muted text-[13px] mt-1 font-bold leading-relaxed">
                您有 {items.filter(i => getExpiryStatus(i.expiryDate).alert).length} 个物品即将过期或已过期，请尽快处理。
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Items Grid */}
      <AnimatePresence mode="popLayout">
        {filteredItems.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-white rounded-fridge-lg border border-black/5 shadow-sm"
          >
            <div className="text-6xl mb-6">🍎</div>
            <h3 className="text-xl font-black text-fridge-text">未找到物品</h3>
            <p className="text-fridge-text-muted mt-2 font-bold">请尝试调整筛选条件或添加新物品。</p>
          </motion.div>
        ) : (
          <motion.div 
            layout
            className="flex flex-col gap-3"
          >
            {filteredItems.map((item) => {
              const expiry = getExpiryStatus(item.expiryDate);
              const isSelected = selectedIds.has(item.id!);
              
              // Determine background color based on category
              const categoryBg = item.category === 'refrigerated' 
                ? 'bg-blue-50' 
                : item.category === 'frozen' 
                  ? 'bg-slate-50' 
                  : 'bg-orange-50';

              const categoryBorder = item.category === 'refrigerated' 
                ? 'border-blue-100' 
                : item.category === 'frozen' 
                  ? 'border-slate-100' 
                  : 'border-orange-100';

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectionMode(true);
                    toggleSelection(item.id!);
                  }}
                  className={`fridge-card p-3 md:p-4 border-2 ${isSelected ? 'ring-2 ring-fridge-orange border-transparent' : categoryBorder} ${categoryBg} relative overflow-hidden flex items-center gap-4 h-[80px] md:h-[90px]`}
                >
                  {/* Selection Overlay */}
                  {selectionMode && (
                    <div 
                      onClick={() => toggleSelection(item.id!)}
                      className="absolute inset-0 z-10 bg-fridge-orange/5 cursor-pointer"
                    >
                      <div className={`absolute top-1/2 -translate-y-1/2 right-4 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-fridge-orange border-fridge-orange scale-110 shadow-lg' : 'bg-white border-black/10'}`}>
                        {isSelected && <Check size={16} className="text-white" />}
                      </div>
                    </div>
                  )}

                  {/* Middle: Main Info Area */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden">
                    <div className="flex items-baseline gap-2">
                      <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
                        <h3 className="font-black text-fridge-text whitespace-nowrap text-base md:text-lg">
                          {item.name}
                        </h3>
                      </div>
                      <span className="text-fridge-orange font-black text-lg md:text-xl shrink-0">
                        {item.quantity || 0}
                        <span className="text-xs md:text-sm font-bold text-fridge-text-muted ml-0.5">{item.unit || '个'}</span>
                      </span>
                    </div>
                    <div className={`flex items-center gap-1 mt-1 text-[10px] md:text-[12px] font-bold ${expiry.color}`}>
                      <Clock size={10} />
                      {expiry.text}
                    </div>
                  </div>

                  {/* Right: Action Area */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col gap-1">
                      <motion.button
                        whileTap={{ scale: 0.8 }}
                        onClick={() => handleUpdateQuantity(item.id!, 1)}
                        className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center text-fridge-text-muted hover:text-fridge-orange transition-colors bg-white rounded-xl shadow-sm border border-black/5"
                      >
                        <Plus size={18} />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.8 }}
                        onClick={() => handleUpdateQuantity(item.id!, -1)}
                        className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center text-fridge-text-muted hover:text-red-600 transition-colors bg-white rounded-xl shadow-sm border border-black/5"
                      >
                        <Minus size={18} />
                      </motion.button>
                    </div>
                    
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === item.id ? null : item.id!);
                      }}
                      className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl transition-all duration-300 flex items-center justify-center shrink-0 ${activeMenuId === item.id ? 'bg-fridge-orange text-white shadow-lg' : 'bg-white hover:bg-fridge-peach/20 border border-black/5 shadow-sm'}`}
                    >
                      {getCategoryIcon(item.category, activeMenuId === item.id)}
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Sheet for Item Actions */}
      <AnimatePresence>
        {activeMenuId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveMenuId(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-md z-[60] md:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[40px] z-[70] p-8 pb-14 shadow-2xl md:hidden"
            >
              <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-8" />
              <div className="mb-8">
                <h3 className="text-2xl font-black tracking-tight text-fridge-text">
                  {items.find(i => i.id === activeMenuId)?.name}
                </h3>
                <p className="text-fridge-text-muted font-bold text-sm mt-1 uppercase tracking-wider">操作菜单</p>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-10">
                <button 
                  onClick={() => handleUpdateCategory(activeMenuId, 'refrigerated')}
                  className={`flex flex-col items-center gap-3 p-5 rounded-[24px] border-2 transition-all duration-300 ${items.find(i => i.id === activeMenuId)?.category === 'refrigerated' ? 'bg-fridge-orange/5 border-fridge-orange text-fridge-orange' : 'bg-fridge-bg border-transparent text-fridge-text-muted'}`}
                >
                  <PixelSnowflake className={`w-8 h-8 ${items.find(i => i.id === activeMenuId)?.category === 'refrigerated' ? 'text-fridge-orange' : 'opacity-40'}`} />
                  <span className="text-[13px] font-bold">冷藏</span>
                </button>
                <button 
                  onClick={() => handleUpdateCategory(activeMenuId, 'frozen')}
                  className={`flex flex-col items-center gap-3 p-5 rounded-[24px] border-2 transition-all duration-300 ${items.find(i => i.id === activeMenuId)?.category === 'frozen' ? 'bg-fridge-blue/5 border-fridge-blue text-fridge-blue' : 'bg-fridge-bg border-transparent text-fridge-text-muted'}`}
                >
                  <PixelIceCube className={`w-8 h-8 ${items.find(i => i.id === activeMenuId)?.category === 'frozen' ? 'text-fridge-blue' : 'opacity-40'}`} />
                  <span className="text-[13px] font-bold">冷冻</span>
                </button>
                <button 
                  onClick={() => handleUpdateCategory(activeMenuId, 'room_temp')}
                  className={`flex flex-col items-center gap-3 p-5 rounded-[24px] border-2 transition-all duration-300 ${items.find(i => i.id === activeMenuId)?.category === 'room_temp' ? 'bg-fridge-green/5 border-fridge-green text-fridge-green' : 'bg-fridge-bg border-transparent text-fridge-text-muted'}`}
                >
                  <PixelBox className={`w-8 h-8 ${items.find(i => i.id === activeMenuId)?.category === 'room_temp' ? 'text-fridge-green' : 'opacity-40'}`} />
                  <span className="text-[13px] font-bold">常温</span>
                </button>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={() => handleUpdateStatus(activeMenuId, 'consumed')}
                  className="w-full py-5 bg-fridge-orange text-white rounded-2xl font-black text-[17px] shadow-xl shadow-fridge-orange/20 flex items-center justify-center gap-3"
                >
                  <CheckCircle size={20} /> 标记为已食用
                </button>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleDiscardItem(activeMenuId)}
                    className="py-4 bg-red-50 text-red-600 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} /> 丢弃
                  </button>
                  <button 
                    onClick={() => setActiveMenuId(null)}
                    className="py-4 bg-fridge-bg text-fridge-text rounded-2xl font-bold text-[17px]"
                  >
                    取消
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Batch Actions Bar */}
      <AnimatePresence>
        {selectionMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-32 left-6 right-6 bg-fridge-text text-white p-5 rounded-[32px] shadow-2xl z-50 flex items-center justify-between md:hidden"
          >
            <div className="flex items-center gap-4 ml-2">
              <div className="bg-fridge-orange text-white w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black shadow-lg shadow-fridge-orange/40">
                {selectedIds.size}
              </div>
              <span className="text-[13px] font-black uppercase tracking-widest opacity-70">已选择</span>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => handleBatchMove('refrigerated')} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                <PixelSnowflake className="w-6 h-6 text-fridge-orange" />
              </button>
              <button onClick={() => handleBatchMove('frozen')} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                <PixelIceCube className="w-6 h-6 text-fridge-blue" />
              </button>
              <button onClick={() => handleBatchMove('room_temp')} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                <PixelBox className="w-6 h-6 text-fridge-green" />
              </button>
              <div className="w-px h-8 bg-white/10 mx-1" />
              <button onClick={handleBatchDelete} className="p-2.5 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors">
                <Trash2 size={22} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
