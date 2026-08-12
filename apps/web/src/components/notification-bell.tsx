"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiClient } from "@/lib/api";

type Notification = {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiClient<{
        data: { notifications: Notification[]; unreadCount: number };
      }>("/api/notifications");
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch {
      // Signed out or API down — leave the bell quiet.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function openNotification(n: Notification) {
    if (!n.readAt) {
      await apiClient(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
      void refresh();
    }
    if (n.linkUrl) {
      setOpen(false);
      router.push(n.linkUrl);
    }
  }

  async function markAllRead() {
    await apiClient("/api/notifications/read-all", { method: "POST" }).catch(() => {});
    void refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 ? (
            <button
              className="text-xs text-muted-foreground underline"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void openNotification(n)}
                className={`block w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted ${
                  n.readAt ? "opacity-60" : ""
                }`}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString("en-IN")}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
