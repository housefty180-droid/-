import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../AuthContext';
import { BarChart2, RefreshCw, Calendar } from 'lucide-react';
import { FridgeItem, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firestoreErrorHandler';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { startOfWeek, startOfMonth, startOfYear, isAfter } from 'date-fns';

import { motion } from 'motion/react';

export const Stats: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year' | 'all'>('all');

  const fetchStats = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'items'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
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
      setItems(fetchedItems);
    } catch (error: any) {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, 'items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  const getFilteredItems = () => {
    if (timeRange === 'all') return items;
    
    const now = new Date();
    let startDate: Date;
    
    switch(timeRange) {
      case 'week': startDate = startOfWeek(now); break;
      case 'month': startDate = startOfMonth(now); break;
      case 'year': startDate = startOfYear(now); break;
      default: return items;
    }
    
    return items.filter(item => {
      const date = item.addedDate || item.lastModified;
      return date && isAfter(date, startDate);
    });
  };

  const filteredItems = getFilteredItems();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="rounded-full h-12 w-12 border-b-2 border-indigo-600"
        />
      </div>
    );
  }

  // Data processing
  const statusData = [
    { name: '存放中', value: filteredItems.filter(i => i.status === 'active').length, color: 'var(--color-fridge-blue)' },
    { name: '已食用', value: filteredItems.filter(i => i.status === 'consumed').length, color: 'var(--color-fridge-green)' },
    { name: '已丢弃', value: filteredItems.filter(i => i.status === 'discarded').length, color: 'var(--color-fridge-orange)' },
  ].filter(d => d.value > 0);

  const categoryData = [
    { name: '冷藏', value: filteredItems.filter(i => i.category === 'refrigerated').length, color: 'var(--color-fridge-orange)' },
    { name: '冷冻', value: filteredItems.filter(i => i.category === 'frozen').length, color: 'var(--color-fridge-blue)' },
    { name: '常温', value: filteredItems.filter(i => i.category === 'room_temp').length, color: 'var(--color-fridge-green)' },
  ].filter(d => d.value > 0);

  const totalItems = filteredItems.length;
  const consumedRate = totalItems > 0 ? Math.round((statusData.find(d => d.name === '已食用')?.value || 0) / totalItems * 100) : 0;
  const discardedRate = totalItems > 0 ? Math.round((statusData.find(d => d.name === '已丢弃')?.value || 0) / totalItems * 100) : 0;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemAnim = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-10 pb-20"
    >
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between py-2">
        <h1 className="text-4xl font-black tracking-tight text-fridge-text">统计数据</h1>
        <div className="flex gap-3">
          <button 
            onClick={fetchStats}
            className="bg-white p-3.5 rounded-full text-fridge-text-muted border border-black/5 shadow-sm"
          >
            <RefreshCw size={20} />
          </button>
          <div className="bg-fridge-orange p-3.5 rounded-full text-white shadow-lg shadow-fridge-orange/20">
            <BarChart2 size={20} />
          </div>
        </div>
      </header>

      {/* Desktop Header */}
      <header className="hidden md:flex items-center justify-between">
        <div>
          <h1 className="text-5xl font-black tracking-tight text-fridge-text">统计数据</h1>
          <p className="text-lg font-bold text-fridge-text-muted mt-2">追踪您的消耗习惯并减少食物浪费。</p>
        </div>
        <button 
          onClick={fetchStats}
          className="flex items-center gap-2 px-8 py-4 bg-white border border-black/5 rounded-full text-fridge-text font-black text-[15px] hover:bg-fridge-peach/20 transition-all shadow-sm"
        >
          <RefreshCw size={18} />
          刷新数据
        </button>
      </header>

      {/* Time Range Selector */}
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        {(['week', 'month', 'year', 'all'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-8 py-3 rounded-full text-[15px] font-black transition-all whitespace-nowrap ${
              timeRange === range 
                ? 'bg-fridge-orange text-white shadow-lg shadow-fridge-orange/30' 
                : 'bg-white text-fridge-text-muted border border-black/5 hover:bg-fridge-peach/20'
            }`}
          >
            {range === 'week' ? '本周' : range === 'month' ? '本月' : range === 'year' ? '今年' : '全部'}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={itemAnim} className="fridge-card p-8 flex flex-col items-center text-center">
          <p className="text-[13px] font-black text-fridge-text-muted uppercase tracking-widest mb-3">记录总数</p>
          <p className="text-6xl font-black tracking-tighter text-fridge-text">{totalItems}</p>
        </motion.div>
        <motion.div variants={itemAnim} className="bg-fridge-green p-8 rounded-fridge-lg shadow-2xl shadow-fridge-green/20 flex flex-col items-center text-center text-white">
          <p className="text-[13px] font-black text-white/70 uppercase tracking-widest mb-3">食用率</p>
          <p className="text-6xl font-black tracking-tighter">{consumedRate}%</p>
        </motion.div>
        <motion.div variants={itemAnim} className="bg-fridge-orange p-8 rounded-fridge-lg shadow-2xl shadow-fridge-orange/20 flex flex-col items-center text-center text-white">
          <p className="text-[13px] font-black text-white/70 uppercase tracking-widest mb-3">浪费率</p>
          <p className="text-6xl font-black tracking-tighter">{discardedRate}%</p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Status Chart */}
        <motion.div variants={itemAnim} className="fridge-card p-8">
          <h3 className="text-xl font-black mb-8 text-fridge-text">物品状态概览</h3>
          <div className="h-72">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '12px 20px', fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: 800, color: 'var(--color-fridge-text)' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-fridge-text-muted font-bold">暂无数据</div>
            )}
          </div>
        </motion.div>

        {/* Category Chart */}
        <motion.div variants={itemAnim} className="fridge-card p-8">
          <h3 className="text-xl font-black mb-8 text-fridge-text">各分类物品数量</h3>
          <div className="h-72">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fill: 'var(--color-fridge-text-muted)', fontSize: 14, fontWeight: 800 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '12px 20px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]} barSize={24}>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-fridge-text-muted font-bold">暂无数据</div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
