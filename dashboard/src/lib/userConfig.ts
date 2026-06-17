export const SHARED_SHEET_ID = '1ZTgKCRs6Hcmi4pymYa6pZOerxX5cqT23FS1Z8c-RwJU';

export interface UserConfig {
  id: string;
  displayName: string;
  socialTab: string;   // e.g. "Krishi Social"
  blogTab: string;     // e.g. "Krishi Blog"
  color: string;
  initials: string;
}

export const USERS: UserConfig[] = [
  { id: 'krishi',    displayName: 'Krishi',    socialTab: 'Krishi Social',    blogTab: 'Krishi Blog',    color: 'blue',    initials: 'KR' },
  { id: 'sameeksha', displayName: 'Sameeksha', socialTab: 'Sameeksha Social', blogTab: 'Sameeksha Blog', color: 'purple',  initials: 'SM' },
  { id: 'aniket',    displayName: 'Aniket',    socialTab: 'Aniket Social',    blogTab: 'Aniket Blog',    color: 'green',   initials: 'AN' },
  { id: 'vansh',     displayName: 'Vansh',     socialTab: 'Vansh Social',     blogTab: 'Vansh Blog',     color: 'orange',  initials: 'VA' },
  { id: 'abhinav',   displayName: 'Abhinav',   socialTab: 'Abhinav Social',   blogTab: 'Abhinav Blog',   color: 'red',     initials: 'AB' },
  { id: 'hritika',   displayName: 'Hritika',   socialTab: 'Hritika Social',   blogTab: 'Hritika Blog',   color: 'pink',    initials: 'HR' },
  { id: 'meenakshi', displayName: 'Meenakshi', socialTab: 'Meenakshi Social', blogTab: 'Meenakshi Blog', color: 'teal',    initials: 'ME' },
  { id: 'sanya',     displayName: 'Sanya',     socialTab: 'Sanya Social',     blogTab: 'Sanya Blog',     color: 'yellow',  initials: 'SA' },
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
