import React from 'react';
import { requireNativeView } from 'expo';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import { nativeMemories } from '@/src/lib/memories-native';

export type MemoriesPlayerStatus = { time?: number; duration?: number; playing?: boolean; error?: string };
type Props = ViewProps & {
  uri: string;
  playing: boolean;
  seek: { time: number; id: number };
  onStatus: (event: NativeSyntheticEvent<MemoriesPlayerStatus>) => void;
};
const NativePlayer = nativeMemories ? requireNativeView<Props>('PintWarsMemories') : null;

export function MemoriesVideoPlayer(props: Props) {
  return NativePlayer ? <NativePlayer {...props} /> : null;
}
