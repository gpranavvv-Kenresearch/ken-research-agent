export const SHARED_SHEET_ID = '1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU';

// A few users were migrated off the shared spreadsheet onto their own personal
// one — same IDs as src/sheets/sheets.ts's PERSONAL_SHEET_ID map on the backend.
// Keep these two registries in sync; this one exists only because the dashboard
// is a separate app with no shared import path to the backend's sheets.ts.
const PERSONAL_SHEET_ID: Record<string, string> = {
  sanya: '1pP_nr0vSfeyoxboaOSIcKI53URHQ6ii4VhvzsIznqCM',
  meenakshi: '1IAI2S1LQJ2opg6zu-Sir7BAC8elHGC9TONLTuhibHKg',
  hritika: '1NjOCYlYPV1W-8FYNoLI7m_lqxx5pr5H9xTWu6OvWmcY',
  vansh: '1N_hPhtCA9qIVBpeftgxqRc0farsjAKTcZWMgbhJZQHM',
  sameeksha: '1MA5duGvHHDe-cnnf4Ibj5-d9mW6JpYcziPkKGbMZZIo',
};

export interface UserConfig {
  id: string;
  displayName: string;
  socialTab: string;   // e.g. "Krishi Social"
  blogTab: string;     // e.g. "Krishi Blog"
  color: string;
  initials: string;
  spreadsheetId?: string; // set only for users on their own personal sheet
}

export const USERS: UserConfig[] = [
  { id: 'krishi',    displayName: 'Krishi',    socialTab: 'Krishi Social',    blogTab: 'Krishi Blog',    color: 'blue',    initials: 'KR' },
  { id: 'sameeksha', displayName: 'Sameeksha', socialTab: 'Sameeksha Social', blogTab: 'Sameeksha Blog', color: 'purple',  initials: 'SM', spreadsheetId: PERSONAL_SHEET_ID.sameeksha },
  { id: 'aniket',    displayName: 'Aniket',    socialTab: 'Aniket Social',    blogTab: 'Aniket Blog',    color: 'green',   initials: 'AN' },
  { id: 'vansh',     displayName: 'Vansh',     socialTab: 'Vansh Social',     blogTab: 'Vansh Blog',     color: 'orange',  initials: 'VA', spreadsheetId: PERSONAL_SHEET_ID.vansh },
  { id: 'abhinav',   displayName: 'Abhinav',   socialTab: 'Abhinav Social',   blogTab: 'Abhinav Blog',   color: 'red',     initials: 'AB' },
  { id: 'hritika',   displayName: 'Hritika',   socialTab: 'Hritika Social',   blogTab: 'Hritika Blog',   color: 'pink',    initials: 'HR', spreadsheetId: PERSONAL_SHEET_ID.hritika },
  { id: 'meenakshi', displayName: 'Meenakshi', socialTab: 'Meenakshi Social', blogTab: 'Meenakshi Blog', color: 'teal',    initials: 'ME', spreadsheetId: PERSONAL_SHEET_ID.meenakshi },
  { id: 'sanya',     displayName: 'Sanya',     socialTab: 'Sanya Social',     blogTab: 'Sanya Blog',     color: 'yellow',  initials: 'SA', spreadsheetId: PERSONAL_SHEET_ID.sanya },
  { id: 'shivani',   displayName: 'Shivani',   socialTab: 'Shivani Social',   blogTab: 'Shivani Blog',   color: 'indigo',  initials: 'SH' },
  { id: 'vijay',     displayName: 'Vijay',     socialTab: 'Vijay Social',     blogTab: 'Vijay Blog',     color: 'cyan',    initials: 'VI' },
  { id: 'shrey',     displayName: 'Shrey',     socialTab: 'Shrey Social',     blogTab: 'Shrey Blog',     color: 'emerald', initials: 'SR' },
  { id: 'pranav',   displayName: 'Pranav',    socialTab: 'Pranav Social',    blogTab: 'Pranav Blog',    color: 'violet',  initials: 'PR' },
  { id: 'vishal',   displayName: 'Vishal',    socialTab: 'Vishal Social',    blogTab: 'Vishal Blog',    color: 'sky',     initials: 'VS' },
  { id: 'avdhesh',  displayName: 'Avdhesh',   socialTab: 'Avdhesh Social',   blogTab: 'Avdhesh Blog',   color: 'rose',    initials: 'AV' },
  { id: 'kamakshi', displayName: 'Kamakshi',  socialTab: 'Kamakshi Social',  blogTab: 'Kamakshi Blog',  color: 'amber',   initials: 'KA' },
];

export const USER_MAP = Object.fromEntries(USERS.map((u) => [u.id, u]));

export function getUser(id: string): UserConfig | undefined {
  return USER_MAP[id];
}

/** The spreadsheet this user's data actually lives in — their personal sheet if migrated, else the shared one. */
export function resolveSheetId(user: UserConfig): string {
  return user.spreadsheetId || SHARED_SHEET_ID;
}
