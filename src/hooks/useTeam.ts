'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, getDoc, getDocs, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import type { Team, TeamMember, TeamInvite, TeamRole } from '@/types/team';

export function useTeam(options?: { skipInvites?: boolean }) {
  const { user, profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName = profile?.displayName || user?.displayName || '';
  const displayPhoto = profile?.photoURL || user?.photoURL || null;
  const skipInvites = options?.skipInvites ?? false;

  // Subscribe to user's teams
  useEffect(() => {
    if (!user) {
      setTeams([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'teams'),
      where('memberUids', 'array-contains', user.uid),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const teamList: Team[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as Team[];
      teamList.sort((a, b) => {
        const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : (a.updatedAt?.toMillis?.() || 0);
        const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : (b.updatedAt?.toMillis?.() || 0);
        return bTime - aTime;
      });
      setTeams(teamList);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Subscribe to pending invites for user (skippable for pages that don't need it)
  useEffect(() => {
    if (skipInvites || !user) {
      setInvites([]);
      return;
    }

    const q = query(
      collection(db, 'teamInvites'),
      where('inviteeUid', '==', user.uid),
      where('status', '==', 'pending'),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const inviteList: TeamInvite[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as TeamInvite[];
      setInvites(inviteList);
    });

    return () => unsubscribe();
  }, [user, skipInvites]);

  // Create a new team
  const createTeam = useCallback(async (name: string, description?: string): Promise<string | null> => {
    if (!user || !displayName) return null;

    // Check max teams limit
    if (teams.length >= 10) {
      throw new Error('הגעת למקסימום 10 צוותים');
    }

    const member: TeamMember = {
      uid: user.uid,
      displayName,
      photoURL: displayPhoto,
      role: 'owner',
      joinedAt: Date.now(),
    };

    // Create team chat first
    const chatRef = await addDoc(collection(db, 'chats'), {
      type: 'group',
      name: `צוות: ${name}`,
      members: [user.uid],
      admins: [user.uid],
      membersInfo: [{ uid: user.uid, displayName, photoURL: displayPhoto }],
      unreadCount: {},
      lastRead: {},
      isTeamChat: true,
      createdAt: serverTimestamp(),
    });

    // Add system message
    await addDoc(collection(db, 'chats', chatRef.id, 'messages'), {
      senderId: 'system',
      senderName: 'מערכת',
      text: `${displayName} יצר/ה את הצוות "${name}"`,
      type: 'system',
      createdAt: serverTimestamp(),
    });

    // Create team
    const teamRef = await addDoc(collection(db, 'teams'), {
      name,
      description: description || '',
      photoURL: null,
      ownerId: user.uid,
      members: [member],
      memberUids: [user.uid],
      adminUids: [user.uid],
      editorUids: [user.uid],
      chatId: chatRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return teamRef.id;
  }, [user, displayName, displayPhoto, teams.length]);

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

    // Notify team members (in parallel)
    const memberUids = teamData.memberUids || [];
    await Promise.all(
      memberUids
        .filter((uid: string) => uid !== user.uid)
        .map((uid: string) =>
          addDoc(collection(db, 'notifications'), {
            userId: uid,
            type: 'team_member_joined',
            title: 'חבר/ה חדש/ה בצוות',
            message: `${displayName} הצטרף/ה ל${teamData.name}`,
            read: false,
            createdAt: Date.now(),
          }).catch(() => {}) // Don't fail if one notification fails
        )
    );
  }, [user, displayName, displayPhoto]);

  // Decline an invite
  const declineInvite = useCallback(async (inviteId: string) => {
    await updateDoc(doc(db, 'teamInvites', inviteId), { status: 'declined' });
  }, []);

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
  }, [user, teams]);

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
  }, [user, teams]);

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
  }, [user, teams]);

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
  }, [user, teams]);

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
    createTeam,
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
