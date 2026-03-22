import React, { useState, useRef } from 'react';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Category, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firestoreErrorHandler';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, Loader2, CheckCircle } from 'lucide-react';
import { PixelSnowflake, PixelIceCube, PixelBox } from '../components/PixelIcons';
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ParsedItem {
  id: string;
  name: string;
  category: Category;
  quantity?: number;
  unit?: string;
  isFridgeItem: boolean;
  expiryDate?: string;
  selected: boolean;
}

import { motion, AnimatePresence } from 'motion/react';

export const ScanReceipt: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
      setParsedItems([]);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const analyzeReceipt = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);

    try {
      const base64Data = image.split(',')[1];
      const mimeType = image.split(';')[0].split(':')[1];

      const todayStr = new Date().toISOString().split('T')[0];
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
            {
              text: `Extract the grocery items from this receipt. For each item:
1. Provide the name in Chinese.
2. Infer the storage category (frozen, refrigerated, or room_temp).
3. Extract quantity and unit in Chinese if available.
4. Determine if it belongs in a fridge/pantry (isFridgeItem: true) or if it is a non-food item like toilet paper (isFridgeItem: false).
5. For branded items (e.g., specific milk brands), use Google Search to find their typical shelf life. For fresh meat/produce, use standard general guidelines (e.g., fresh meat 3-5 days refrigerated, 1 month frozen). Calculate the estimated expiry date from today (${todayStr}) and return it in YYYY-MM-DD format.`,
            },
          ],
        },
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'The name of the item' },
                category: { 
                  type: Type.STRING, 
                  description: 'The storage category',
                  enum: ['frozen', 'refrigerated', 'room_temp']
                },
                quantity: { type: Type.NUMBER, description: 'The quantity of the item' },
                unit: { type: Type.STRING, description: 'The unit of measurement (e.g., kg, lbs, count)' },
                isFridgeItem: { type: Type.BOOLEAN, description: 'True if it is a food/fridge/pantry item, false if it is a non-food item like toilet paper or cleaning supplies.' },
                expiryDate: { type: Type.STRING, description: 'Estimated expiry date in YYYY-MM-DD format based on brand search or general guidelines.' }
              },
              required: ['name', 'category', 'isFridgeItem']
            }
          }
        }
      });

      const jsonStr = response.text?.trim() || '[]';
      const rawItems: any[] = JSON.parse(jsonStr);
      const items: ParsedItem[] = rawItems.map((item, index) => ({
        ...item,
        id: `item-${index}-${Date.now()}`,
        selected: item.isFridgeItem, // Auto-select fridge items, deselect non-fridge items
      }));
      setParsedItems(items);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '分析小票失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setParsedItems(items => items.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const updateQuantity = (id: string, newQuantity: number | undefined) => {
    setParsedItems(items => items.map(item => 
      item.id === id ? { ...item, quantity: newQuantity } : item
    ));
  };

  const saveItems = async () => {
    const selectedItems = parsedItems.filter(item => item.selected);
    if (!user || selectedItems.length === 0) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      
      selectedItems.forEach((item) => {
        const docRef = doc(collection(db, 'items'));
        let expiryDateObj = null;
        if (item.expiryDate) {
          const parsedDate = new Date(item.expiryDate);
          if (!isNaN(parsedDate.getTime())) {
            expiryDateObj = parsedDate;
          }
        }

        batch.set(docRef, {
          userId: user.uid,
          name: (item.name || 'Unknown Item').substring(0, 100),
          category: ['frozen', 'refrigerated', 'room_temp'].includes(item.category) ? item.category : 'refrigerated',
          addedDate: serverTimestamp(),
          lastModified: serverTimestamp(),
          status: 'active',
          quantity: item.quantity !== undefined && item.quantity !== null ? Math.max(0, Number(item.quantity)) : null,
          unit: item.unit ? String(item.unit).substring(0, 50) : null,
          expiryDate: expiryDateObj,
        });
      });

      await batch.commit();
      navigate('/');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'items');
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="max-w-4xl mx-auto pb-20"
    >
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between py-2 mb-8">
        <h1 className="text-4xl font-black tracking-tight text-fridge-text">扫描小票</h1>
        <div className="bg-fridge-orange p-3.5 rounded-full text-white shadow-lg shadow-fridge-orange/20">
          <Camera size={24} />
        </div>
      </header>

      {/* Desktop Header */}
      <header className="hidden md:block mb-10">
        <h1 className="text-5xl font-black tracking-tight text-fridge-text">扫描小票</h1>
        <p className="text-lg font-bold text-fridge-text-muted mt-2">拍下您的购物小票，AI 将自动识别并分类您的食材。</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Section */}
        <div className="fridge-card p-8 flex flex-col items-center justify-center min-h-[400px]">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
          
          <AnimatePresence mode="wait">
            {image ? (
              <motion.div 
                key="image-preview"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full h-full flex flex-col items-center"
              >
                <div className="relative w-full h-80 mb-8 rounded-fridge-lg overflow-hidden border border-black/5 bg-fridge-bg shadow-inner">
                  <img src={image} alt="Receipt" className="w-full h-full object-contain" />
                </div>
                <div className="flex gap-4 w-full">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-5 px-6 rounded-full font-black text-fridge-text bg-fridge-bg border border-black/5 transition-all text-[15px]"
                  >
                    重拍
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={analyzeReceipt}
                    disabled={loading}
                    className="flex-[2] bg-fridge-orange text-white py-5 px-6 rounded-full font-black transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-2xl shadow-fridge-orange/20 text-[15px]"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : '开始分析'}
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="upload-placeholder"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-72 border-2 border-dashed border-fridge-orange/20 rounded-fridge-lg flex flex-col items-center justify-center text-fridge-text-muted hover:text-fridge-orange hover:border-fridge-orange hover:bg-fridge-orange/5 transition-all cursor-pointer p-10 text-center group"
              >
                <div className="bg-fridge-bg p-8 rounded-full mb-6 group-hover:scale-110 transition-transform">
                  <Camera size={48} className="text-fridge-text-muted group-hover:text-fridge-orange transition-colors" />
                </div>
                <h3 className="text-xl font-black text-fridge-text mb-2">点击拍摄小票</h3>
                <p className="text-[15px] text-fridge-text-muted font-bold max-w-[200px]">AI 将自动识别并分类您的食材</p>
              </motion.div>
            )}
          </AnimatePresence>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-50 text-red-600 rounded-fridge border border-red-100 text-sm w-full text-center font-black"
            >
              {error}
            </motion.div>
          )}
        </div>

        {/* Results Section */}
        <div className="fridge-card p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black flex items-center gap-3 text-fridge-text">
              <CheckCircle className="text-fridge-green" size={28} />
              识别结果
            </h2>
            {parsedItems.length > 0 && (
              <span className="text-[13px] font-black bg-fridge-bg text-fridge-text-muted px-4 py-1.5 rounded-full border border-black/5">
                {parsedItems.filter(i => i.selected).length} / {parsedItems.length}
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto min-h-[350px] mb-8 no-scrollbar">
            <AnimatePresence mode="popLayout">
              {parsedItems.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-fridge-text-muted text-sm text-center p-10"
                >
                  <div className="bg-fridge-bg p-6 rounded-full mb-6 opacity-50">
                    <Upload size={40} />
                  </div>
                  <p className="font-black text-lg text-fridge-text">上传并分析小票以在此处查看物品。</p>
                </motion.div>
              ) : (
                <motion.ul 
                  layout
                  className="space-y-4"
                >
                    {parsedItems.map((item) => (
                      <motion.li 
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => toggleSelection(item.id)}
                        className={`flex items-center justify-between p-5 rounded-fridge border transition-all cursor-pointer active:scale-[0.98] ${item.selected ? 'bg-fridge-orange/5 border-fridge-orange/20 shadow-sm' : 'bg-white border-black/5'}`}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div 
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${item.selected ? 'bg-fridge-orange border-fridge-orange' : 'border-black/10'}`}
                          >
                            {item.selected && <CheckCircle size={16} className="text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className={`font-black text-lg ${item.selected ? 'text-fridge-text' : 'text-fridge-text-muted'}`}>{item.name}</p>
                            <div className="flex gap-3 items-center mt-1">
                              <span className="text-[11px] font-black uppercase tracking-wider text-fridge-text-muted flex items-center gap-1.5">
                                {item.category === 'refrigerated' ? <><PixelSnowflake className="w-3.5 h-3.5 text-fridge-orange" /> 冷藏</> : item.category === 'frozen' ? <><PixelIceCube className="w-3.5 h-3.5 text-fridge-blue" /> 冷冻</> : <><PixelBox className="w-3.5 h-3.5 text-fridge-green" /> 常温</>}
                              </span>
                              {!item.isFridgeItem && <span className="text-[11px] font-black bg-fridge-peach/20 text-fridge-orange px-2 py-0.5 rounded-md">建议丢弃</span>}
                            </div>
                          </div>
                        </div>
                        {item.selected && (
                          <div 
                            className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-black/5 shadow-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input 
                              type="number" 
                              min="0"
                              value={item.quantity || ''} 
                              onChange={(e) => updateQuantity(item.id, e.target.value ? Number(e.target.value) : undefined)}
                              className="w-14 text-[15px] font-black border-none focus:ring-0 p-1 text-center bg-transparent text-fridge-text"
                              placeholder="0"
                            />
                            {item.unit && <span className="text-[11px] font-black text-fridge-text-muted pr-3">{item.unit}</span>}
                          </div>
                        )}
                      </motion.li>
                    ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={saveItems}
            disabled={loading || parsedItems.filter(i => i.selected).length === 0}
            className="w-full bg-fridge-text text-white py-6 px-8 rounded-full font-black text-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl"
          >
            <Upload size={24} />
            {loading && parsedItems.length > 0 ? '正在同步...' : `同步到冰箱`}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};
