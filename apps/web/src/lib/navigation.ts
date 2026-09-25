export type NavigationItem = { label: string; href: string };
export type NavigationGroup = { label: string; items: NavigationItem[] };

export function getNavigation(_role: 'admin'): NavigationGroup[] {
  void _role;
  return [{ label: 'MAIN MENU', items: [{ label: 'Dashboard', href: '/' }] }];
}

export const upcomingSections = [
  { label: 'Students', icon: 'students' },
  { label: 'Teachers', icon: 'teachers' },
  { label: 'Parents', icon: 'parents' },
  { label: 'Class & Section', icon: 'classes' },
  { label: 'Attendance', icon: 'attendance' },
  { label: 'Fees Collection', icon: 'fees' },
  { label: 'Examinations', icon: 'exams' },
] as const;
