'use client';

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { storage } from '@/lib/firebase';

type ProfilePhotoUploadButtonProps = {
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  onError?: (message: string) => void;
  onSuccess?: () => void;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(-80) || 'avatar';
}

function storagePathFromURL(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/v0\/b\/[^/]+\/o\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export default function ProfilePhotoUploadButton({
  className,
  children,
  disabled,
  onError,
  onSuccess,
}: ProfilePhotoUploadButtonProps) {
  const { profile, updateUserProfile, refreshUserProfile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profile?.uid) return;

    if (!file.type.startsWith('image/')) {
      onError?.('אפשר להעלות קובץ תמונה בלבד.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      onError?.('התמונה גדולה מדי. אפשר להעלות עד 5MB.');
      return;
    }

    setUploading(true);
    const oldCustomPhotoURL = profile.customPhotoURL;
    try {
      const storageRef = ref(storage, `avatars/${profile.uid}/${Date.now()}_${safeFileName(file.name)}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const photoURL = await getDownloadURL(storageRef);
      await updateUserProfile({ photoURL, customPhotoURL: photoURL });
      await refreshUserProfile();

      // Delete old avatar from Storage after confirmed success
      if (oldCustomPhotoURL?.includes('firebasestorage.googleapis.com')) {
        const oldPath = storagePathFromURL(oldCustomPhotoURL);
        if (oldPath?.startsWith('avatars/')) {
          deleteObject(ref(storage, oldPath)).catch(() => {});
        }
      }

      onSuccess?.();
    } catch {
      onError?.('לא הצלחנו להעלות את התמונה. נסה שוב בעוד רגע.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className={className}
        aria-label="עריכת תמונת פרופיל"
      >
        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  );
}
