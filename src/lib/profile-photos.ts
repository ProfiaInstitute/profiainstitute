import { supabase } from "@/integrations/supabase/client";

export const PROFILE_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface ProfilePhoto {
  path: string;
  url: string;
}

export async function fetchProfilePhotos(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const photos = new Map<string, ProfilePhoto | null>();
  if (!ids.length) return photos;

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,avatar_url")
    .in("id", ids);
  if (error) throw error;

  const profilesWithPhotos = (profiles ?? []).filter(
    (profile): profile is typeof profile & { avatar_url: string } => !!profile.avatar_url,
  );
  for (const id of ids) photos.set(id, null);
  if (!profilesWithPhotos.length) return photos;

  const paths = profilesWithPhotos.map((profile) => profile.avatar_url);
  const { data: signedPhotos, error: signedError } = await supabase.storage
    .from("profile-photos")
    .createSignedUrls(paths, 3600);
  if (signedError) throw signedError;
  const failedPhoto = signedPhotos?.find((photo) => photo.error);
  if (failedPhoto?.error)
    throw new Error(`Could not create profile photo link: ${failedPhoto.error}`);

  const signedByPath = new Map(
    (signedPhotos ?? []).flatMap((photo) =>
      photo.signedUrl ? [[photo.path, photo.signedUrl] as const] : [],
    ),
  );
  for (const profile of profilesWithPhotos) {
    const url = signedByPath.get(profile.avatar_url);
    if (url) photos.set(profile.id, { path: profile.avatar_url, url });
  }
  return photos;
}
