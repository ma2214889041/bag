import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Image as ImageIcon, Loader2, Download, Wand2, Trash2, RefreshCw, Check, AlertCircle, Layers, Settings2, X, Box, CheckCircle2, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface ImageTask {
  id: string;
  sourceUrl: string;
  mimeType: string;
  base64Data: string;
  generatedUrl: string | null;
  status: 'idle' | 'generating' | 'success' | 'error';
  error: string | null;
  viewAngle: string;
  bgColor: string;
  aspectRatio: string;
}

const VIEW_ANGLES = [
  { id: 'front', label: '正视图 (Front)' },
  { id: 'back', label: '背面图 (Back)' },
  { id: 'side', label: '侧视图 (Side)' },
  { id: 'three_quarter', label: '45度侧面 (3/4 View)' },
  { id: 'top', label: '俯视图/平铺 (Top/Flat)' },
  { id: 'bottom', label: '底视图 (Bottom)' },
  { id: 'detail', label: '局部细节 (Detail)' },
  { id: 'interior', label: '内部结构 (Interior)' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '4:3', label: '4:3' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
];

const IMAGE_SIZES = [
  { id: '512px', label: '512px' },
  { id: '1K', label: '1K' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
];

export default function App() {
  const [hasKey, setHasKey] = useState(true);
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Global Settings
  const [generationType, setGenerationType] = useState<'product' | 'model'>('product');
  const [bgColor, setBgColor] = useState<'white' | 'offwhite'>('white');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');
  const [globalViewAngle, setGlobalViewAngle] = useState('front');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasKey(has);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const processFiles = async (files: FileList | null) => {
    if (!files) return;
    
    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const newTasks = await Promise.all(validFiles.map(file => {
      return new Promise<ImageTask>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve({
            id: Math.random().toString(36).substring(7),
            sourceUrl: result,
            mimeType: file.type,
            base64Data: result.split(',')[1],
            generatedUrl: null,
            status: 'idle',
            error: null,
            viewAngle: globalViewAngle,
            bgColor: bgColor,
            aspectRatio: aspectRatio
          });
        };
        reader.readAsDataURL(file);
      });
    }));

    setTasks(prev => [...newTasks, ...prev]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    processFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };
  
  const clearAllTasks = () => {
    if (window.confirm('确定要清空所有任务吗？')) {
      setTasks([]);
    }
  };

  const updateTaskSetting = (id: string, key: keyof ImageTask, value: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [key]: value } : t));
  };

  const generateSingle = async (task: ImageTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'generating', error: null } : t));

    try {
      // Create a fresh instance right before the call to ensure the latest API key is used
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });

      const basePrompt = `请严格还原参考图中包的所有视觉特征，包括形状轮廓、尺寸比例、材质质感、颜色色调、五金配件、提手或背带类型、开合结构、表面纹路等所有细节。包的还原准确度最优先，不得对包的任何特征进行改动或简化。`;
      let bgText = task.bgColor === 'white' ? '纯白色背景' : '米白色(#f3f0eb)背景';
      let prompt = '';

      if (generationType === 'product') {
        const viewLabel = VIEW_ANGLES.find(a => a.id === task.viewAngle)?.label || '正视图';
        prompt = `${basePrompt}\n\n将此包生成产品图，要求如下：\n- ${bgText}，包居中，包底部与画面底部留有一点点空隙\n- 视角要求：**${viewLabel}**\n- 光线：四周环绕式柔光，模拟studio环形灯效果，包的边缘四周均有柔和反光，皮革表面呈现自然油蜡感光泽，光泽从包的整体散发而非单点高光，底部与边角有轻微渐变阴影增加立体感\n- 不出现单一强高光点，整体光感均匀、包体自然发光\n- 皮革质感真实，细节清晰`;
      } else {
        prompt = `${basePrompt}\n\n模特图要求：\n- ${bgText}\n- 欧洲女性模特，白皙皮肤，身材纤细，神情自然内敛，微微低头\n- 全身构图\n- 单手自然垂提包，手臂放松，包正面朝向镜头，完整清晰可见\n- 服装风格：复古知性，慵懒随性，大地色系为主，整体色调克制不超过3个色块，比例协调，有层次感，非运动非休闲非正装\n- 自然散射光，胶片质感，商业lookbook摄影风格，Toteme / Arket 品牌调性`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: task.base64Data,
                mimeType: task.mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: task.aspectRatio,
            imageSize: imageSize
          }
        }
      });

      let foundImage = false;
      if (response.candidates && response.candidates.length > 0) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'success', generatedUrl: imageUrl } : t));
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage) {
        throw new Error('未能生成图片，请重试。');
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      if (err.message && err.message.includes('Requested entity was not found')) {
        setHasKey(false);
      }
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error', error: err.message || '生成失败' } : t));
    }
  };

  const handleGenerateAll = async () => {
    const pendingTasks = tasks.filter(t => t.status === 'idle' || t.status === 'error');
    if (pendingTasks.length === 0) return;

    setIsGeneratingAll(true);
    await Promise.all(pendingTasks.map(task => generateSingle(task)));
    setIsGeneratingAll(false);
  };

  const handleDownload = (url: string, prefix: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  const handleDownloadAll = () => {
    tasks.filter(t => t.status === 'success' && t.generatedUrl).forEach((task, index) => {
      setTimeout(() => {
        handleDownload(task.generatedUrl!, `batch-result-${index + 1}`);
      }, index * 200);
    });
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-zinc-200 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
            <Key className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 mb-2">需要配置 API Key</h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              您选择了高分辨率/自定义比例的高级图像生成模型 (Gemini 3.1 Flash Image)。
              使用此模型需要您绑定自己的 Google Cloud API Key。
            </p>
          </div>
          <button
            onClick={handleSelectKey}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors shadow-md"
          >
            配置 API Key
          </button>
          <p className="text-xs text-zinc-400">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-zinc-600">
              查看计费文档
            </a>
          </p>
        </div>
      </div>
    );
  }

  const pendingCount = tasks.filter(t => t.status === 'idle' || t.status === 'error').length;
  const successCount = tasks.filter(t => t.status === 'success').length;

  return (
    <div className="flex h-screen bg-[#F8F9FA] font-sans text-zinc-900 overflow-hidden selection:bg-zinc-200">
      
      {/* Left Sidebar */}
      <aside className="w-[340px] bg-white border-r border-zinc-200 flex flex-col h-full z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex-shrink-0">
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-zinc-900 text-white rounded-lg flex items-center justify-center shadow-sm">
              <Box className="w-4 h-4" />
            </div>
            <h1 className="text-base font-bold tracking-tight">AI Product Studio</h1>
          </div>
        </div>

        {/* Scrollable Controls */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Upload Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-900">1. 上传参考图</h2>
              <span className="text-[10px] font-medium bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">支持多选</span>
            </div>
            
            <div 
              className="border-2 border-dashed border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all rounded-xl p-6 text-center cursor-pointer group flex flex-col items-center justify-center"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                multiple
                onChange={handleImageUpload}
              />
              <div className="w-12 h-12 bg-zinc-100 group-hover:bg-zinc-200 transition-colors rounded-full flex items-center justify-center mb-3 shadow-sm">
                <UploadCloud className="w-5 h-5 text-zinc-600" />
              </div>
              <p className="text-sm font-medium text-zinc-700">点击或拖拽图片至此</p>
              <p className="text-xs text-zinc-400 mt-1">按住 Ctrl/Cmd 键可多选</p>
            </div>
          </section>

          {/* Settings Section */}
          <section className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Settings2 className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-900">2. 全局生成设置</h2>
            </div>

            {/* Type */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500">图像类型</label>
              <div className="flex p-1 bg-zinc-100/80 rounded-lg border border-zinc-200/50">
                <button
                  onClick={() => setGenerationType('product')}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${generationType === 'product' ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-black/5' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  产品图
                </button>
                <button
                  onClick={() => setGenerationType('model')}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${generationType === 'model' ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-black/5' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  模特图
                </button>
              </div>
            </div>

            {/* Background */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500">默认背景颜色</label>
              <div className="flex p-1 bg-zinc-100/80 rounded-lg border border-zinc-200/50">
                <button
                  onClick={() => setBgColor('white')}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${bgColor === 'white' ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-black/5' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  <div className="w-3 h-3 rounded-full border border-zinc-200 bg-white"></div>
                  纯白
                </button>
                <button
                  onClick={() => setBgColor('offwhite')}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${bgColor === 'offwhite' ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-black/5' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  <div className="w-3 h-3 rounded-full border border-zinc-300 bg-[#f3f0eb]"></div>
                  米白
                </button>
              </div>
            </div>

            {/* Resolution & Aspect Ratio */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500">分辨率</label>
                <select 
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  className="w-full bg-white border border-zinc-200 text-sm text-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm"
                >
                  {IMAGE_SIZES.map(size => (
                    <option key={size.id} value={size.id}>{size.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500">默认画面比例</label>
                <select 
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-white border border-zinc-200 text-sm text-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm"
                >
                  {ASPECT_RATIOS.map(ratio => (
                    <option key={ratio.id} value={ratio.id}>{ratio.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Global View Angle (Default for new uploads) */}
            {generationType === 'product' && (
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <label className="text-xs font-medium text-zinc-500 flex justify-between">
                  <span>默认产品视图</span>
                  <span className="text-[10px] text-zinc-400">上传时自动应用</span>
                </label>
                <select 
                  value={globalViewAngle}
                  onChange={(e) => setGlobalViewAngle(e.target.value)}
                  className="w-full bg-white border border-zinc-200 text-sm text-zinc-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm"
                >
                  {VIEW_ANGLES.map(angle => (
                    <option key={angle.id} value={angle.id}>{angle.label}</option>
                  ))}
                </select>
              </div>
            )}
          </section>
        </div>

        {/* Action Footer */}
        <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex-shrink-0">
          <button
            onClick={handleGenerateAll}
            disabled={tasks.length === 0 || pendingCount === 0 || isGeneratingAll}
            className={`w-full py-3.5 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all ${
              tasks.length === 0 || pendingCount === 0 || isGeneratingAll 
                ? 'bg-zinc-300 cursor-not-allowed' 
                : 'bg-zinc-900 hover:bg-zinc-800 shadow-md hover:shadow-lg active:scale-[0.98]'
            }`}
          >
            {isGeneratingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在批量生成...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                {pendingCount > 0 ? `开始批量生成 (${pendingCount})` : '全部生成完毕'}
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Right Main Canvas */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* Topbar */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-zinc-900">任务画廊</h2>
            {tasks.length > 0 && (
              <span className="text-xs font-medium bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-full">
                共 {tasks.length} 项
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {tasks.length > 0 && (
              <button 
                onClick={clearAllTasks}
                className="text-sm font-medium text-zinc-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
              >
                清空全部
              </button>
            )}
            {successCount > 0 && (
              <button 
                onClick={handleDownloadAll}
                className="text-sm font-medium text-zinc-700 hover:text-zinc-900 flex items-center gap-2 transition-colors bg-white border border-zinc-200 hover:bg-zinc-50 px-4 py-1.5 rounded-lg shadow-sm"
              >
                <Download className="w-4 h-4" /> 批量下载 ({successCount})
              </button>
            )}
          </div>
        </header>

        {/* Grid Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4">
              <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center border border-zinc-100">
                <Layers className="w-10 h-10 text-zinc-300" />
              </div>
              <div className="text-center">
                <p className="text-base font-medium text-zinc-600">画廊空空如也</p>
                <p className="text-sm text-zinc-400 mt-1">请在左侧面板上传图片以开始创作</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 auto-rows-max">
              <AnimatePresence>
                {tasks.map(task => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={task.id} 
                    className="group relative rounded-2xl overflow-hidden bg-white border border-zinc-200 shadow-sm hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Image Layer */}
                    <div className="relative overflow-hidden bg-zinc-100 aspect-square">
                      <img 
                        src={task.status === 'success' && task.generatedUrl ? task.generatedUrl : task.sourceUrl} 
                        className={`w-full h-full object-cover transition-all duration-700 ${task.status === 'generating' ? 'blur-md scale-110 opacity-50' : ''}`} 
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Status Overlays */}
                      {task.status === 'idle' && (
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <span className="bg-white/90 backdrop-blur-sm text-zinc-900 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
                            等待生成
                          </span>
                        </div>
                      )}
                      
                      {task.status === 'generating' && (
                        <div className="absolute inset-0 bg-zinc-900/20 flex flex-col items-center justify-center text-zinc-900">
                          <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg flex flex-col items-center">
                            <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-600" />
                            <span className="text-xs font-bold tracking-wider">渲染中</span>
                          </div>
                        </div>
                      )}

                      {task.status === 'error' && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                          <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                          <p className="text-xs font-medium text-red-600 line-clamp-3 mb-3">{task.error}</p>
                          <button 
                            onClick={() => generateSingle(task)}
                            className="bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> 重试
                          </button>
                        </div>
                      )}

                      {/* Success Actions Overlay */}
                      {task.status === 'success' && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                          <div className="flex justify-between items-end">
                            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider shadow-sm flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> 完成
                            </span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleDownload(task.generatedUrl!, 'result')} 
                                className="w-8 h-8 bg-white text-zinc-900 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors shadow-sm"
                                title="下载图片"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Delete Button (Top Right) */}
                      {task.status !== 'generating' && (
                        <button 
                          onClick={() => removeTask(task.id)} 
                          className="absolute top-3 right-3 w-7 h-7 bg-black/40 backdrop-blur-md text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all z-10"
                          title="移除"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Source Indicator for Success */}
                      {task.status === 'success' && (
                        <div className="absolute top-3 left-3 w-10 h-10 rounded-lg overflow-hidden border-2 border-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 group/source cursor-pointer">
                          <img src={task.sourceUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/source:opacity-100 transition-opacity">
                            <span className="text-[8px] text-white font-bold">原图</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Per-Task Settings (Only for idle/error state) */}
                    {(task.status === 'idle' || task.status === 'error') && (
                      <div className="p-2 bg-white border-t border-zinc-100 flex flex-col gap-1.5">
                        {generationType === 'product' && (
                          <select
                            value={task.viewAngle}
                            onChange={(e) => updateTaskSetting(task.id, 'viewAngle', e.target.value)}
                            className="w-full bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-900 hover:bg-zinc-100 transition-colors"
                          >
                            {VIEW_ANGLES.map(angle => (
                              <option key={angle.id} value={angle.id}>{angle.label}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex gap-1.5">
                          <select
                            value={task.bgColor}
                            onChange={(e) => updateTaskSetting(task.id, 'bgColor', e.target.value)}
                            className="flex-1 bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-700 rounded-md px-1.5 py-1.5 outline-none focus:ring-1 focus:ring-zinc-900 hover:bg-zinc-100 transition-colors"
                          >
                            <option value="white">纯白背景</option>
                            <option value="offwhite">米白背景</option>
                          </select>
                          <select
                            value={task.aspectRatio}
                            onChange={(e) => updateTaskSetting(task.id, 'aspectRatio', e.target.value)}
                            className="flex-1 bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-700 rounded-md px-1.5 py-1.5 outline-none focus:ring-1 focus:ring-zinc-900 hover:bg-zinc-100 transition-colors"
                          >
                            {ASPECT_RATIOS.map(ratio => (
                              <option key={ratio.id} value={ratio.id}>{ratio.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
