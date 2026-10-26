import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ProfilePhotoAvatar({
  src,
  name,
  className,
}: {
  src?: string | undefined;
  name: string;
  className?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase() ?? "")
      .join("") || "?";

  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt={`${name}'s profile photo`} />}
      <AvatarFallback className="bg-cream font-semibold text-brand">{initials}</AvatarFallback>
    </Avatar>
  );
}
