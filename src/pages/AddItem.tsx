import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Category, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firestoreErrorHandler';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Save, ChevronLeft } from 'lucide-react';

export const AddItem: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('refrigerated');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'items'), {
        userId: user.uid,
        name: name.trim().substring(0, 100),
        category: ['frozen', 'refrigerated', 'room_temp'].includes(category) ? category : 'refrigerated',
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        addedDate: serverTimestamp(),
        lastModified: serverTimestamp(),
        status: 'active',
        quantity: quantity !== '' ? Math.max(0, Number(quantity)) : null,
        unit: unit.trim().substring(0, 50) || null,
      });
      navigate('/');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'items');
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="max-w-2xl mx-auto pb-20"
    >
      {/* Mobile Header */}
      <header className="md:hidden flex items-center gap-4 py-2 mb-8">
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="p-3.5 bg-white rounded-full shadow-sm border border-black/5"
        >
          <ChevronLeft size={24} className="text-fridge-text" />
        </motion.button>
        <h1 className="text-3xl font-black tracking-tight text-fridge-text">添加物品</h1>
      </header>

      {/* Desktop Header */}
      <header className="hidden md:block mb-10">
        <h1 className="text-5xl font-black tracking-tight text-fridge-text">添加物品</h1>
        <p className="text-lg font-bold text-fridge-text-muted mt-2">手动添加新物品到您的库存中。</p>
      </header>

      <div className="fridge-card p-8 md:p-12">
        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="space-y-4">
            <label className="block text-[13px] font-black text-fridge-text-muted uppercase tracking-widest ml-1">物品名称 *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-8 py-5 bg-fridge-bg border-none rounded-fridge focus:ring-2 focus:ring-fridge-orange/20 outline-none transition-all font-black text-fridge-text text-xl placeholder:text-fridge-text-muted/30"
              placeholder="例如：有机牛奶"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <label className="block text-[13px] font-black text-fridge-text-muted uppercase tracking-widest ml-1">分类 *</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full px-8 py-5 bg-fridge-bg border-none rounded-fridge focus:ring-2 focus:ring-fridge-orange/20 outline-none transition-all appearance-none font-black text-fridge-text text-xl"
                >
                  <option value="refrigerated">❄️ 冷藏</option>
                  <option value="frozen">🧊 冷冻</option>
                  <option value="room_temp">🧺 常温</option>
                </select>
                <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none text-fridge-text-muted">
                  <ChevronLeft size={20} className="-rotate-90" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-[13px] font-black text-fridge-text-muted uppercase tracking-widest ml-1">过期日期</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-8 py-5 bg-fridge-bg border-none rounded-fridge focus:ring-2 focus:ring-fridge-orange/20 outline-none transition-all font-black text-fridge-text text-xl"
              />
            </div>

            <div className="space-y-4">
              <label className="block text-[13px] font-black text-fridge-text-muted uppercase tracking-widest ml-1">数量</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-8 py-5 bg-fridge-bg border-none rounded-fridge focus:ring-2 focus:ring-fridge-orange/20 outline-none transition-all font-black text-fridge-text text-xl placeholder:text-fridge-text-muted/30"
                placeholder="例如：2"
              />
            </div>

            <div className="space-y-4">
              <label className="block text-[13px] font-black text-fridge-text-muted uppercase tracking-widest ml-1">单位</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-8 py-5 bg-fridge-bg border-none rounded-fridge focus:ring-2 focus:ring-fridge-orange/20 outline-none transition-all font-black text-fridge-text text-xl placeholder:text-fridge-text-muted/30"
                placeholder="例如：升, 千克, 个"
              />
            </div>
          </div>

          <div className="pt-10 border-t border-black/5">
            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full bg-fridge-orange text-white py-6 px-8 rounded-full font-black text-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-fridge-orange/20"
            >
              <Save size={24} />
              {loading ? '正在保存...' : '保存到冰箱'}
            </motion.button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};
