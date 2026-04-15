import React, { useState, useRef } from 'react';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Category, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firestoreErrorHandler';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, Loader2, CheckCircle } from 'lucide-react';
import { PixelSnowflake, PixelIceCube, PixelBox } from '../components/PixelIcons';
import { OpenAI } from 'openai';
import Tesseract from 'tesseract.js';
import { motion, AnimatePresence } from 'motion/react';

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

export const ScanReceipt: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [image, setImage] = useState<string | null>(null);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debugText, setDebugText] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');

  const apiKey = process.env.FRIDGE_API_KEY || process.env.GEMINI_API_KEY;
  const openai = new OpenAI({
    apiKey: apiKey || '',
    baseURL: 'https://api.deepseek.com',
    dangerouslyAllowBrowser: true
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim;
            width = maxDim;
          } else {
            width = (width / height) * maxDim;
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const resizedImage = canvas.toDataURL('image/jpeg', 0.9);
        setImage(resizedImage);

        const ocrCanvas = document.createElement('canvas');
        const scale = 2;
        ocrCanvas.width = width * scale;
        ocrCanvas.height = height * scale;
        const ocrCtx = ocrCanvas.getContext('2d');
        if (ocrCtx) {
          ocrCtx.imageSmoothingEnabled = true;
          ocrCtx.imageSmoothingQuality = 'high';
          ocrCtx.filter = 'grayscale(100%) contrast(160%) brightness(110%)';
          ocrCtx.drawImage(img, 0, 0, width * scale, height * scale);
          setOcrImage(ocrCanvas.toDataURL('image/png'));
        }

        setParsedItems([]);
        setError(null);
        setDebugText(null);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const analyzeReceipt = async () => {
    if (!image) return;
    setLoading(true);
    setOcrProgress(0);
    setError(null);
    setDebugText(null);

    try {
      const targetImage = ocrImage || image;
      const { data: { text } } = await Tesseract.recognize(targetImage, 'chi_sim+eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        }
      });

      setDebugText(text);

      if (!text || text.trim().length < 5) {
        throw new Error('未能从图片中识别出足够的文字。请尝试：\n1. 靠近拍摄\n2. 保持光线充足\n3. 确保文字水平');
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const response = await openai.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是一个极其严谨的超市小票数据提取专家。
我会给你一段 OCR 文本，请严格遵守以下规则：
1. 严禁幻想：只提取小票上明确出现的商品。如果文字太乱看不清，直接忽略，绝对不要猜测不存在的商品（如可口可乐）。
2. 修正名称：修正 OCR 识别错误的汉字（例如“圆椒起”修正为“圆椒”）。
3. 判定逻辑：
   - isFridgeItem: 只要是食材、生鲜、零食、调料，必须为 true。只有洗发水、纸巾等日用品为 false。
   - category: 蔬菜水果默认为 refrigerated（冷藏），肉类默认为 frozen（冷冻），干货默认为 room_temp（常温）。
4. 价格辅助：商品名通常在单价和金额之前，利用这个位置关系定位。

输出严格 JSON：
{
  "items": [
    {
      "name": "修正后的中文名",
      "category": "frozen|refrigerated|room_temp",
      "quantity": 数字,
      "unit": "单位",
      "isFridgeItem": true,
      "expiryDate": "YYYY-MM-DD"
    }
  ]
}`
          },
          {
            role: 'user',
            content: `OCR 原始文本：\n${text}`
          }
        ],
        // @ts-ignore
        response_format: { type: 'json_object' }
      });

      let content = response.choices[0].message.content || '{"items": []}';
      content = content.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();

      let rawItems: any[] = [];
      try {
        const parsed = JSON.parse(content);
        rawItems = Array.isArray(parsed) ? parsed : (parsed.items || parsed.grocery_items || []);
      } catch (e) {
        console.error("Failed to parse JSON", e);
        const match = content.match(/\[.*\]/s);
        if (match) {
          rawItems = JSON.parse(match[0]);
        } else {
          throw new Error('无法解析模型返回的数据格式。');
        }
      }

      const items: ParsedItem[] = rawItems.map((item, index) => ({
        ...item,
        id: `item-${index}-${Date.now()}`,
        selected: !!item.isFridgeItem,
      }));
      setParsedItems(items);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '分析小票失败，请检查 API 额度或网络连接。');
    } finally {
      setLoading(false);
      setOcrProgress(0);
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

  const addItemManually = () => {
    if (!newItemName.trim()) return;
    const newItem: ParsedItem = {
      id: `manual-${Date.now()}`,
      name: newItemName.trim(),
      category: 'refrigerated',
      isFridgeItem: true,
      selected: true,
    };
    setParsedItems([newItem, ...parsedItems]);
    setNewItemName('');
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
      <header className="md:hidden flex items-center justify-between py-2 mb-8">
        <h1 className="text-4xl font-black tracking-tight text-fridge-text">扫描小票</h1>
        <div className="bg-fridge-orange p-3.5 rounded-full text-white shadow-lg shadow-fridge-orange/20">
          <Camera size={24} />
        </div>
      </header>

      <header className="hidden md:block mb-10">
        <h1 className="text-5xl font-black tracking-tight text-fridge-text">扫描小票</h1>
        <p className="text-lg font-bold text-fridge-text-muted mt-2">拍下您的购物小票，AI 将自动识别并分类您的食材。</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {!apiKey && (
          <div className="lg:col-span-2 bg-amber-50 border-2 border-amber-200 p-6 rounded-fridge-lg flex flex-col items-center text-center gap-4 mb-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
              <Camera size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-amber-900">未配置 AI 密钥</h3>
              <p className="text-sm font-bold text-amber-700 mt-1">
                请在 AI Studio 的 <b>Settings -&gt; Secrets</b> 中添加 <b>FRIDGE_API_KEY</b> 变量，否则无法识别小票。
              </p>
            </div>
          </div>
        )}
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
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="animate-spin" size={20} />
                        <span>{ocrProgress > 0 ? `识别中 ${ocrProgress}%` : '处理中...'}</span>
                      </div>
                    ) : '开始分析'}
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
              className="mt-6 p-4 bg-red-50 text-red-600 rounded-fridge border border-red-100 text-sm w-full font-black"
            >
              <p className="mb-2">⚠️ {error}</p>
              {debugText && (
                <details className="mt-2 text-[10px] opacity-70">
                  <summary className="cursor-pointer hover:underline">查看识别到的原始文字（调试用）</summary>
                  <pre className="mt-2 whitespace-pre-wrap bg-white/50 p-2 rounded border border-red-200 max-h-32 overflow-y-auto">
                    {debugText}
                  </pre>
                </details>
              )}
            </motion.div>
          )}
        </div>

        <div className="fridge-card p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black flex items-center gap-3 text-fridge-text">
              <CheckCircle className="text-fridge-green" size={28} />
              识别结果
            </h2>
            <div className="flex items-center gap-2">
              {parsedItems.length > 0 && (
                <button 
                  onClick={() => setParsedItems([])}
                  className="text-[11px] font-black bg-red-50 text-red-500 px-3 py-1.5 rounded-full border border-red-100 hover:bg-red-100 transition-colors"
                >
                  清空
                </button>
              )}
              {parsedItems.length > 0 && (
                <span className="text-[13px] font-black bg-fridge-bg text-fridge-text-muted px-4 py-1.5 rounded-full border border-black/5">
                  {parsedItems.filter(i => i.selected).length} / {parsedItems.length}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto min-h-[350px] mb-8 no-scrollbar">
            {parsedItems.length > 0 && (
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addItemManually()}
                  placeholder="手动添加漏掉的商品..."
                  className="flex-1 bg-fridge-bg border border-black/5 rounded-full px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-fridge-orange/20 outline-none"
                />
                <button
                  onClick={addItemManually}
                  className="bg-fridge-orange text-white px-4 py-2 rounded-full font-black text-sm shadow-sm active:scale-95 transition-all"
                >
                  添加
                </button>
              </div>
            )}

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
                <motion.ul layout className="space-y-4">
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
                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${item.selected ? 'bg-fridge-orange border-fridge-orange' : 'border-black/10'}`}>
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
                        <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-black/5 shadow-sm" onClick={(e) => e.stopPropagation()}>
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
