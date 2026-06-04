export type AppRelease = {
  version_code: number;
  version_name: string;
  apk_url: string;
  sha256?: string;
};

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'downloading'
  | 'installing'
  | 'error';
