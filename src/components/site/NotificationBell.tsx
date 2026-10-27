import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell({
  userId,
  onNavigate,
}: {
  userId: string;
  onNavigate: (category: string) => void;
}) {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["in-app-notifications", userId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,category,read,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
  const unreadCount = notificationsQuery.data?.filter((item) => !item.read).length ?? 0;

  async function openNotification(notification: { id: string; category: string; read: boolean }) {
    if (!notification.read) {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notification.id);
      if (error) {
        toast.error("Could not update notification", { description: error.message });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["in-app-notifications", userId] });
    }
    onNavigate(notification.category);
  }

  return (
    <details className="relative">
      <summary
        className="relative grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md border bg-background hover:bg-muted"
        aria-label={`${unreadCount} unread notifications`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </summary>
      <section className="absolute right-0 z-50 mt-2 max-h-[28rem] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-card p-3 text-foreground shadow-lift">
        <h2 className="px-2 py-1 text-sm font-semibold">Notifications</h2>
        {notificationsQuery.error ? (
          <p role="alert" className="p-2 text-sm text-destructive">
            Could not load notifications: {notificationsQuery.error.message}
          </p>
        ) : notificationsQuery.data?.length ? (
          <ul className="divide-y">
            {notificationsQuery.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-3 text-left hover:bg-muted ${item.read ? "" : "bg-primary/5"}`}
                  onClick={() => void openNotification(item)}
                >
                  <span className="flex items-start gap-2">
                    {!item.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.title}</span>
                      {item.body && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.body}
                        </span>
                      )}
                      <time className="mt-1 block text-[10px] text-muted-foreground">
                        {new Date(item.created_at).toLocaleString("en-KE")}
                      </time>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-2 text-sm text-muted-foreground">You have no notifications.</p>
        )}
      </section>
    </details>
  );
}
