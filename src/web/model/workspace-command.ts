import type { DiffSide } from '../monaco/line-mapping.js';

export type WorkspaceCommand =
  | Readonly<{ type: 'announce'; text: string }>
  | Readonly<{ type: 'focus-comment'; commentId: string }>
  | Readonly<{ type: 'focus-editor-line'; fileId: string; side: DiffSide; line: number }>
  | Readonly<{ type: 'focus-gutter'; fileId: string; side: DiffSide; line: number }>
  | Readonly<{ type: 'go-to-change'; direction: 'next' | 'previous' }>
  | Readonly<{ type: 'layout' }>
  | Readonly<{ type: 'load-file'; fileId: string }>
  | Readonly<{ type: 'persist-comment'; fileId: string; requestId: number; side: DiffSide; line: number; endLine?: number; body: string }>
  | Readonly<{ type: 'rebuild-annotations'; fileId: string }>
  | Readonly<{ type: 'restore-view'; fileId: string; scrollTop: number; context: 'collapsed' | 'all-revealed' }>
  | Readonly<{ type: 'reveal-comment-context'; fileId: string; side: DiffSide; line: number }>
  | Readonly<{ type: 'reveal-line'; fileId: string; side: DiffSide; line: number; endLine?: number; center: boolean }>;
