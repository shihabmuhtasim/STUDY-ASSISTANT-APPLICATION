import React, { useState, useRef, useEffect } from 'react';
import { GripVertical } from 'lucide-react';

interface HorizontalSplitterProps {
  left: React.ReactNode;
  right: React.ReactNode;
  initialLeftWidth?: number; // percentage 0-100
}

export function HorizontalSplitter({ left, right, initialLeftWidth = 50 }: HorizontalSplitterProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      // Constrain between 20% and 80%
      setLeftWidth(Math.min(Math.max(newLeftWidth, 20), 80));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
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
  }, [isDragging]);

  return (
    <div ref={containerRef} className="flex flex-row w-full items-stretch">
      <div style={{ width: `calc(${leftWidth}% - 8px)` }} className="flex-shrink-0">
        {left}
      </div>
      
      <div 
        className="w-4 flex-shrink-0 flex items-center justify-center cursor-col-resize hover:bg-indigo-100/50 transition-colors group z-10 mx-1 rounded-full"
        onMouseDown={handleMouseDown}
      >
        <div className="h-8 w-1 bg-slate-300 group-hover:bg-indigo-400 rounded-full transition-colors" />
      </div>
      
      <div style={{ width: `calc(${100 - leftWidth}% - 8px)` }} className="flex-shrink-0">
        {right}
      </div>
    </div>
  );
}
