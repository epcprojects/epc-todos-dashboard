export type Team = 'designer' | 'editor' | 'admin' | 'unassigned';
export type Role = 'admin' | 'designer' | 'editor';
export type Status = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export const TEAMS: Record<Team, string> = {
  designer: 'Graphic Designer',
  editor: 'Video Editor',
  admin: 'Admin Only',
  unassigned: 'Unassigned',
};
export const TEAM_KEYS = Object.keys(TEAMS) as Team[];
export const TEAM_SHORT: Record<Team, string> = {
  designer: 'Design',
  editor: 'Video',
  admin: 'Admin',
  unassigned: 'Unassigned',
};
export const ROLES: Record<Role, string> = {
  admin: 'Admin',
  designer: 'Graphic Designer',
  editor: 'Video Editor',
};
export const STATUS: Record<Status, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
};
export const STATUS_KEYS: Status[] = ['not_started', 'in_progress', 'completed', 'blocked'];

export const CHUNK_SIZE = 200;

export interface FieldDef {
  k: FieldKey;
  label: string;
  syn: string[];
}
export type FieldKey = 'date' | 'time' | 'day' | 'platform' | 'title' | 'type' | 'pillar';
export type ColumnMap = Record<FieldKey, number>;

export const FIELDS: FieldDef[] = [
  { k: 'date', label: 'Posting Date', syn: ['date to post', 'posting date', 'post date', 'publish date', 'publishing date', 'scheduled date', 'schedule date', 'go live date', 'date'] },
  { k: 'time', label: 'Posting Time', syn: ['time to post', 'posting time', 'post time', 'publish time', 'publishing time', 'time'] },
  { k: 'day', label: 'Day', syn: ['day to post', 'posting day', 'post day', 'publish day', 'day'] },
  { k: 'platform', label: 'Platform', syn: ['post platform', 'platform', 'platforms', 'channel', 'channels', 'social network', 'network'] },
  { k: 'title', label: 'Title', syn: ['title', 'post title', 'video title', 'content title', 'headline', 'topic', 'subject', 'hook'] },
  { k: 'type', label: 'Type', syn: ['type', 'content type', 'post type', 'format', 'asset type'] },
  { k: 'pillar', label: 'Content Pillar', syn: ['content pillar', 'pillar', 'pillars', 'category', 'theme'] },
];

export const PLAT: [string, string, string][] = [
  ['linkedin', 'LinkedIn', 'in'],
  ['instagram', 'Instagram', 'IG'],
  ['facebook', 'Facebook', 'f'],
  ['youtube', 'YouTube', 'YT'],
  ['tiktok', 'TikTok', 'TT'],
  ['twitter', 'X / Twitter', 'X'],
  ['threads', 'Threads', '@'],
  ['pinterest', 'Pinterest', 'P'],
];
export const PLAT_ALIAS: Record<string, string> = {
  ig: 'instagram',
  insta: 'instagram',
  fb: 'facebook',
  yt: 'youtube',
  li: 'linkedin',
  x: 'twitter',
  xtwitter: 'twitter',
};

/** A task as the browser sees it (camelCase view of the `tasks` table). */
export interface Task {
  id: string;
  importId: string;
  sheetIdx: number;
  sheet: string;
  workbook: string;
  row: number;
  h: string[];
  v: string[];
  u: Record<string, string>;
  m: ColumnMap;
  dateOrder: 'dmy' | 'mdy';
  postDate: string | null;
  time: string;
  day: string;
  platform: string;
  title: string;
  type: string;
  pillar: string;
  dupKey: string;
  team: Team;
  status: Status;
  blockedReason: string;
  notes: string;
  adminNote: string;
  archived: boolean;
  createdAt: string;
  importedAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastCompletedAt: string | null;
  sourceUpdatedFrom: string | null;
  sourceUpdatedAt: string | null;
}

export interface HistoryEntry {
  at: string;
  name: string;
  role: Role;
  msg: string;
  taskId?: string;
  title?: string;
}

export interface SheetMeta {
  idx: number;
  name: string;
  team: Team;
  rows: number;
  added: number;
  updated: number;
  skipped: number;
  headers: string[];
  map: ColumnMap;
  dateOrder: 'dmy' | 'mdy';
}

export interface ImportRec {
  id: string;
  workbook: string;
  mode: 'skip' | 'update' | 'new';
  status: 'importing' | 'complete' | 'incomplete';
  errors: number;
  totalTasks: number;
  uploadedBy: string | null;
  uploadedAt: string;
  finishedAt: string | null;
  sheets: SheetMeta[];
}

export interface Settings {
  targetBuffer: number;
  allowTeamEdit: boolean;
  pins: Record<Role, boolean>;
}

export interface SessionInfo {
  authenticated: boolean;
  role?: Role;
  name?: string;
  setupNeeded: boolean;
  pins: Record<Role, boolean>;
}
