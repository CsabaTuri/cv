export type SkillIcon =
  | 'server'
  | 'container'
  | 'terminal'
  | 'code'
  | 'database'
  | 'shield'
  | 'wrench'
  | 'bug'
  | 'sparkles';

export type SkillCategoryKey =
  | 'virtualization'
  | 'containers'
  | 'os'
  | 'programming'
  | 'testing'
  | 'ai'
  | 'databases'
  | 'infrastructure'
  | 'tools';

export interface SkillCategory {
  key: SkillCategoryKey;
  icon: SkillIcon;
  items: string[];
}

export const skillCategories: SkillCategory[] = [
  {
    key: 'testing',
    icon: 'bug',
    items: ['Katalon Studio', 'Robot Framework', 'Browser Library', 'Postman', 'Manual testing'],
  },
  {
    key: 'containers',
    icon: 'container',
    items: ['Docker', 'Docker Compose', 'Portainer', 'Jenkins', 'GitHub Actions', 'Netlify', 'CI/CD pipelines'],
  },
  {key: 'virtualization', icon: 'server', items: ['VMware', 'KVM', 'QEMU']},
  {
    key: 'ai',
    icon: 'sparkles',
    items: ['n8n', 'CrewAI', 'AI agents', 'Ollama', 'RunPod Serverless', 'Workflow automation'],
  },
  {
    key: 'os',
    icon: 'terminal',
    items: ['Debian', 'Arch', 'Ubuntu', 'Fedora KDE', 'CachyOS', 'Windows Server 2022'],
  },
  {
    key: 'programming',
    icon: 'code',
    items: ['Python', 'TypeScript', 'PHP', 'Bash'],
  },
  {key: 'databases', icon: 'database', items: ['MySQL', 'MSSQL', 'Supabase']},
  {
    key: 'infrastructure',
    icon: 'shield',
    items: ['Grafana', 'Prometheus', 'Netdata', 'Kuma', 'Backup & recovery', 'Network configuration'],
  },
  {key: 'tools', icon: 'wrench', items: ['Jira', 'Redmine', 'OpenProject']},
];
