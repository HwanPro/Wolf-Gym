"use client";
import Image from 'next/image';
import { useEffect, useState, type ComponentProps } from 'react';

export default function SafeImage({src, onError, ...props}: ComponentProps<typeof Image>) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <Image {...props} src={failed || !src ? '/icons/icon-512.png' : src} onError={event => {
    setFailed(true);
    onError?.(event);
  }} />;
}
