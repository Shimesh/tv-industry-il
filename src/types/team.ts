import { Timestamp } from 'firebase/firestore';

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface TeamMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: TeamRole;
  joinedAt: Timestamp | number;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  photoURL?: string | null;
  ownerId: string;
  members: TeamMember[];
  memberUids: string[];
  adminUids: string[];
  editorUids: string[];
  chatId: string;
  createdAt: Timestamp | number;
  updatedAt: Timestamp | number;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  teamName: string;
  invitedBy: string;
  invitedByName: string;
  inviteeEmail?: string;
  inviteeUid?: string;
  role: TeamRole;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: Timestamp | number;
  expiresAt: Timestamp | number;
}

/** Hebrew labels for team roles */
export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  member: 'חבר צוות',
  viewer: 'צופה',
};

/** Check if a team role can perform admin actions (edit settings, invite/remove) */
export function isTeamAdmin(role: TeamRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Check if a team role can edit schedules */
export function canEditTeamSchedule(role: TeamRole | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}
