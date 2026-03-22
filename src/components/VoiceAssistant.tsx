import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { OperationType } from '../types';
import { handleFirestoreError } from '../utils/firestoreErrorHandler';
import { motion } from 'motion/react';

// @ts-ignore
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const VoiceAssistant: React.FC = () => {
  const { user } = useAuth();
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const startListening = () => {
    if (!SpeechRecognition) {
      setFeedback('您的浏览器不支持语音识别。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      setFeedback('正在聆听...');
    };

    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setIsListening(false);
      await processVoiceCommand(text);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setFeedback('请在浏览器设置中允许麦克风权限。');
      } else if (event.error === 'network') {
        setFeedback('网络连接问题，请检查网络。');
      } else if (event.error === 'no-speech') {
        setFeedback('未检测到语音，请大声点。');
      } else {
        setFeedback('语音识别失败，请重试。');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const processVoiceCommand = async (text: string) => {
    if (!user) return;
    setIsProcessing(true);
    setFeedback('正在处理指令...');

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `User said: "${text}". Parse this into an action for a fridge management app.
Action can be 'ADD' (add a new item) or 'DELETE' (remove/consume an item).
If ADD, extract name, category (frozen, refrigerated, room_temp), quantity, unit, and estimate expiryDate (YYYY-MM-DD) from today (${todayStr}) using standard guidelines or search.
If DELETE, extract the name of the item to delete.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING, enum: ['ADD', 'DELETE', 'UNKNOWN'] },
              item: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ['frozen', 'refrigerated', 'room_temp'] },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  expiryDate: { type: Type.STRING }
                }
              }
            },
            required: ['action']
          }
        }
      });

      const result = JSON.parse(response.text?.trim() || '{}');

      if (result.action === 'ADD' && result.item?.name) {
        let expiryDateObj = null;
        if (result.item.expiryDate) {
          const parsedDate = new Date(result.item.expiryDate);
          if (!isNaN(parsedDate.getTime())) expiryDateObj = parsedDate;
        }

        await addDoc(collection(db, 'items'), {
          userId: user.uid,
          name: result.item.name.substring(0, 100),
          category: ['frozen', 'refrigerated', 'room_temp'].includes(result.item.category) ? result.item.category : 'refrigerated',
          addedDate: serverTimestamp(),
          status: 'active',
          quantity: result.item.quantity ? Math.max(0, Number(result.item.quantity)) : null,
          unit: result.item.unit ? String(result.item.unit).substring(0, 50) : null,
          expiryDate: expiryDateObj,
        });
        setFeedback(`已添加：${result.item.name}`);
      } else if (result.action === 'DELETE' && result.item?.name) {
        // Find item by name and mark as consumed
        const q = query(
          collection(db, 'items'),
          where('userId', '==', user.uid),
          where('status', '==', 'active')
        );
        const snapshot = await getDocs(q);
        let found = false;
        snapshot.forEach(async (document) => {
          const data = document.data();
          if (data.name.toLowerCase().includes(result.item.name.toLowerCase()) && !found) {
            found = true;
            await updateDoc(doc(db, 'items', document.id), { status: 'consumed' });
          }
        });
        if (found) {
          setFeedback(`已移除：${result.item.name}`);
        } else {
          setFeedback(`未找到物品：${result.item.name}`);
        }
      } else {
        setFeedback('未能理解您的指令，请再说一遍。');
      }
    } catch (error) {
      console.error(error);
      setFeedback('处理失败，请重试。');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      drag
      dragMomentum={false}
      whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
      className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50 flex flex-col items-end gap-3 touch-none"
    >
      {feedback && (
        <div className="bg-slate-900/90 backdrop-blur-md text-white text-[10px] font-medium px-3 py-1.5 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 max-w-[180px] text-center border border-white/10 pointer-events-none select-none">
          {feedback}
        </div>
      )}
      <button
        onClick={isListening ? undefined : startListening}
        disabled={isProcessing}
        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${
          isListening 
            ? 'bg-red-500 text-white animate-pulse' 
            : isProcessing
            ? 'bg-indigo-400 text-white cursor-not-allowed'
            : 'bg-indigo-600/90 hover:bg-indigo-700 text-white backdrop-blur-sm'
        }`}
      >
        {isProcessing ? (
          <Loader2 size={20} className="animate-spin" />
        ) : isListening ? (
          <MicOff size={20} />
        ) : (
          <Mic size={20} />
        )}
      </button>
    </motion.div>
  );
};
