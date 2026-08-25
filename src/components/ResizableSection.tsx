import React, { useState, useRef, useEffect } from 'react';
import { GripHorizontal } from 'lucide-react';

interface ResizableSectionProps {
  children: React.ReactNode;
  initialHeight: number;
  minHeight?: number;
  overflow?: 'hidden' | 'auto' | 'visible';
}

export function ResizableSection({ children, initialHeight, minHeight = 200, overflow = 'hidden' }: ResizableSectionProps) {
  const [height, setHeight] = useState(initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startYRef.current = e.pageY;
    startHeightRef.current = height;
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = e.pageY - startYRef.current;
      setHeight(Math.max(minHeight, startHeightRef.current + deltaY));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minHeight]);

  return (
    <div className="flex flex-col w-full relative" style={{ height: `${height}px` }}>
      <div className="flex-1" style={{ overflow }}>
        {children}
      </div>
      <div 
        className="h-4 w-full flex items-center justify-center cursor-row-resize hover:bg-indigo-100/50 transition-colors group shrink-0 bg-slate-50 border-b border-slate-200"
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal className="text-slate-300 group-hover:text-indigo-400 w-4 h-4" />
      </div>
    </div>
  );
}
