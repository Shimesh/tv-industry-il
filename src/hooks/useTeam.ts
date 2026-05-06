'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs, query, where, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import type { Team, TeamMember, TeamInvite, TeamRole } from '@/types/team';

export function useTeam() {
  const { user, profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  const displayName = profile?.displayName || user?.displayName || '';
  const displayPhoto = profile?.photoURL || user?.photoURL || null;

  const fetchTeamsAndInvites = useCallback(async () => {
    if (!user || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/teams', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        console.error('[useTeam] GET /api/teams failed:', response.status, await response.text().catch(() => ''));
        return;
      }
      const data = await response.json() as { teams: Team[]; invites: TeamInvite[] };
      setTeams(data.teams ?? []);
      setInvites(data.invites ?? []);
    } catch {
      // silent — keep previous state
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setTeams([]);
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchTeamsAndInvites();
  }, [user, fetchTeamsAndInvites]);

  const createTeamViaApi = useCallback(async (name: string, description?: string): Promise<string | null> => {
    if (!user || !displayName) return null;

    if (teams.length >= 10) {
      throw new Error('הגעת למקסימום 10 צוותים');
    }

    const token = await user.getIdToken();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description: description || '' }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('יצירת הצוות ארכה יותר מדי זמן. נסה שוב בעוד רגע.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'יצירת הצוות נכשלה');
    }

    const teamId = typeof payload?.teamId === 'string' ? payload.teamId : null;
    // Refresh list so new team appears immediately
    await fetchTeamsAndInvites();
    return teamId;
  }, [user, displayName, teams.length, fetchTeamsAndInvites]);

  // Update team settings
  const updateTeam = useCallback(async (teamId: string, data: { name?: string; description?: string; photoURL?: string | null }) => {
    if (!user) return;
    await updateDoc(doc(db, 'teams', teamId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    // Also update chat name if team name changed
    const team = teams.find(t => t.id === teamId);
    if (data.name && team?.chatId) {
      await updateDoc(doc(db, 'chats', team.chatId), {
        name: `צוות: ${data.name}`,
      });
    }
  }, [user, teams]);

  // Invite a user to a team
  const inviteToTeam = useCallback(async (teamId: string, inviteeUid: string, role: TeamRole = 'member') => {
    if (!user || !displayName) return;

    const team = teams.find(t => t.id === teamId);
    if (!team) throw new Error('צוות לא נמצא');

    // Check if already a member
    if (team.memberUids.includes(inviteeUid)) {
      throw new Error('המשתמש כבר חבר בצוות');
    }

    // Check if pending invite already exists
    const existingQ = query(
      collection(db, 'teamInvites'),
      where('teamId', '==', teamId),
      where('inviteeUid', '==', inviteeUid),
      where('status', '==', 'pending'),
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      throw new Error('כבר נשלחה הזמנה למשתמש זה');
    }

    // Check max members
    if (team.members.length >= 50) {
      throw new Error('הצוות הגיע למקסימום 50 חברים');
    }

    // Create invite
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await addDoc(collection(db, 'teamInvites'), {
      teamId,
      teamName: team.name,
      invitedBy: user.uid,
      invitedByName: displayName,
      inviteeUid,
      role,
      status: 'pending',
      createdAt: serverTimestamp(),
      expiresAt,
    });

    // Create notification for invitee
    await addDoc(collection(db, 'notifications'), {
      userId: inviteeUid,
      type: 'team_invite',
      title: 'הזמנה לצוות',
      message: `הוזמנת להצטרף ל${team.name}`,
      read: false,
      createdAt: Date.now(),
    });
  }, [user, displayName, teams]);

  // Accept an invite
  const acceptInvite = useCallback(async (invite: TeamInvite) => {
    if (!user || !displayName) return;

    const teamRef = doc(db, 'teams', invite.teamId);
    const teamSnap = await getDoc(teamRef);
    if (!teamSnap.exists()) {
      // Team was deleted
      await updateDoc(doc(db, 'teamInvites', invite.id), { status: 'expired' });
      throw new Error('הצוות כבר לא קיים');
    }

    const teamData = teamSnap.data();

    const newMember: TeamMember = {
      uid: user.uid,
      displayName,
      photoURL: displayPhoto,
      role: invite.role,
      joinedAt: Date.now(),
    };

    // Update team with new member
    const updateData: Record<string, unknown> = {
      members: arrayUnion(newMember),
      memberUids: arrayUnion(user.uid),
      updatedAt: serverTimestamp(),
    };

    if (invite.role === 'admin') {
      updateData.adminUids = arrayUnion(user.uid);
    }
    if (invite.role !== 'viewer') {
      updateData.editorUids = arrayUnion(user.uid);
    }

    await updateDoc(teamRef, updateData);

    // Mark invite as accepted
    await updateDoc(doc(db, 'teamInvites', invite.id), { status: 'accepted' });

    // Add to team chat
    if (teamData.chatId) {
      await updateDoc(doc(db, 'chats', teamData.chatId), {
        members: arrayUnion(user.uid),
        membersInfo: arrayUnion({ uid: user.uid, displayName, photoURL: displayPhoto }),
      });

      // System message
      await addDoc(collection(db, 'chats', teamData.chatId, 'messages'), {
        senderId: 'system',
        senderName: 'מערכת',
        text: `${displayName} הצטרף/ה לצוות`,
        type: 'system',
        createdAt: serverTimestamp(),
      });
    }

    // Notify team members
    const memberUids = teamData.memberUids || [];
    for (const uid of memberUids) {
      if (uid === user.uid) continue;
      await addDoc(collection(db, 'notifications'), {
        userId: uid,
        type: 'team_member_joined',
        title: 'חבר/ה חדש/ה בצוות',
        message: `${displayName} הצטרף/ה ל${teamData.name}`,
        read: false,
        createdAt: Date.now(),
      });
    }

    await fetchTeamsAndInvites();
  }, [user, displayName, displayPhoto, fetchTeamsAndInvites]);

  // Decline an invite
  const declineInvite = useCallback(async (inviteId: string) => {
    await updateDoc(doc(db, 'teamInvites', inviteId), { status: 'declined' });
    await fetchTeamsAndInvites();
  }, [fetchTeamsAndInvites]);

  // Remove a member from a team
  const removeMember = useCallback(async (teamId: string, memberUid: string) => {
    if (!user) return;

    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    const memberToRemove = team.members.find(m => m.uid === memberUid);
    if (!memberToRemove) return;

    // Cannot remove owner
    if (memberToRemove.role === 'owner') {
      throw new Error('לא ניתן להסיר את בעל הצוות');
    }

    // Remove member from team arrays
    await updateDoc(doc(db, 'teams', teamId), {
      members: team.members.filter(m => m.uid !== memberUid),
      memberUids: arrayRemove(memberUid),
      adminUids: arrayRemove(memberUid),
      editorUids: arrayRemove(memberUid),
      updatedAt: serverTimestamp(),
    });

    // Remove from chat
    if (team.chatId) {
      const chatRef = doc(db, 'chats', team.chatId);
      const chatSnap = await getDoc(chatRef);
      if (chatSnap.exists()) {
        const chatData = chatSnap.data();
        await updateDoc(chatRef, {
          members: (chatData.members || []).filter((uid: string) => uid !== memberUid),
          membersInfo: (chatData.membersInfo || []).filter((m: { uid?: string }) => m.uid !== memberUid),
        });
      }
    }

    await fetchTeamsAndInvites();
  }, [user, teams, fetchTeamsAndInvites]);

  // Leave a team (for non-owners)
  const leaveTeam = useCallback(async (teamId: string) => {
    if (!user) return;

    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    if (team.ownerId === user.uid) {
      throw new Error('בעל הצוות לא יכול לעזוב. העבר בעלות או מחק את הצוות');
    }

    await removeMember(teamId, user.uid);
  }, [user, teams, removeMember]);

  // Change a member's role
  const changeMemberRole = useCallback(async (teamId: string, memberUid: string, newRole: TeamRole) => {
    if (!user) return;

    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    const updatedMembers = team.members.map(m =>
      m.uid === memberUid ? { ...m, role: newRole } : m
    );

    const adminUids = updatedMembers
      .filter(m => m.role === 'owner' || m.role === 'admin')
      .map(m => m.uid);

    const editorUids = updatedMembers
      .filter(m => m.role !== 'viewer')
      .map(m => m.uid);

    await updateDoc(doc(db, 'teams', teamId), {
      members: updatedMembers,
      adminUids,
      editorUids,
      updatedAt: serverTimestamp(),
    });

    // Notify the member
    await addDoc(collection(db, 'notifications'), {
      userId: memberUid,
      type: 'team_role_changed',
      title: 'שינוי תפקיד',
      message: `התפקיד שלך ב${team.name} שונה`,
      read: false,
      createdAt: Date.now(),
    });

    await fetchTeamsAndInvites();
  }, [user, teams, fetchTeamsAndInvites]);

  // Transfer ownership
  const transferOwnership = useCallback(async (teamId: string, newOwnerUid: string) => {
    if (!user) return;

    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    if (team.ownerId !== user.uid) {
      throw new Error('רק בעל הצוות יכול להעביר בעלות');
    }

    const updatedMembers = team.members.map(m => {
      if (m.uid === newOwnerUid) return { ...m, role: 'owner' as TeamRole };
      if (m.uid === user.uid) return { ...m, role: 'admin' as TeamRole };
      return m;
    });

    const adminUids = updatedMembers
      .filter(m => m.role === 'owner' || m.role === 'admin')
      .map(m => m.uid);

    const editorUids = updatedMembers
      .filter(m => m.role !== 'viewer')
      .map(m => m.uid);

    await updateDoc(doc(db, 'teams', teamId), {
      ownerId: newOwnerUid,
      members: updatedMembers,
      adminUids,
      editorUids,
      updatedAt: serverTimestamp(),
    });

    await fetchTeamsAndInvites();
  }, [user, teams, fetchTeamsAndInvites]);

  // Delete a team
  const deleteTeam = useCallback(async (teamId: string) => {
    if (!user) return;

    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    if (team.ownerId !== user.uid) {
      throw new Error('רק בעל הצוות יכול למחוק את הצוות');
    }

    // Delete team doc (sub-collections are orphaned, harmless)
    await deleteDoc(doc(db, 'teams', teamId));

    // Delete team chat
    if (team.chatId) {
      await deleteDoc(doc(db, 'chats', team.chatId));
    }

    await fetchTeamsAndInvites();
  }, [user, teams, fetchTeamsAndInvites]);

  // Get user's role in a specific team
  const getUserRole = useCallback((teamId: string): TeamRole | null => {
    if (!user) return null;
    const team = teams.find(t => t.id === teamId);
    if (!team) return null;
    const member = team.members.find(m => m.uid === user.uid);
    return member?.role || null;
  }, [user, teams]);

  return {
    teams,
    invites,
    loading,
    refresh: fetchTeamsAndInvites,
    createTeam: createTeamViaApi,
    updateTeam,
    inviteToTeam,
    acceptInvite,
    declineInvite,
    removeMember,
    leaveTeam,
    changeMemberRole,
    transferOwnership,
    deleteTeam,
    getUserRole,
  };
}
