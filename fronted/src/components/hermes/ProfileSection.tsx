import { useEffect, useState } from "react";
import { User, Pencil, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { ApiError, isNetworkError } from "@/lib/api-client";
import { getProfile, updateProfile } from "@/api/profile";

const USERNAME_MAX = 120;

/**
 * Settings page profile card. Reads and writes a single `username` field via
 * the backend `/api/profile` endpoint. The server-reported updatedAt is used
 * for a subtle "last saved" line when a value is present.
 */
export function ProfileSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    retry: (count, err) => (isNetworkError(err) ? false : count < 2),
  });

  const username = profileQuery.data?.username ?? "";
  const updatedAtIso = profileQuery.data?.updatedAt ?? null;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  // Keep draft in sync with fetched data unless the user is actively editing.
  useEffect(() => {
    if (!isEditing) setDraft(username);
  }, [username, isEditing]);

  const mutation = useMutation({
    mutationFn: (next: string) => updateProfile({ username: next }),
    onSuccess: (data) => {
      queryClient.setQueryData(["profile"], data);
      setIsEditing(false);
      setDraftError(null);
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (value.length > USERNAME_MAX) {
      setDraftError(t("settings.profile.error.usernameMax"));
      return;
    }
    setDraftError(null);
    mutation.mutate(value);
  };

  const handleCancel = () => {
    setDraft(username);
    setDraftError(null);
    setIsEditing(false);
    mutation.reset();
  };

  const lastUpdated =
    updatedAtIso && updatedAtIso !== new Date(0).toISOString()
      ? new Date(updatedAtIso).toLocaleString()
      : null;

  return (
    <section
      aria-labelledby="profile-heading"
      className="rounded-2xl border border-border bg-card p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" aria-hidden />
          <h2 id="profile-heading" className="text-lg font-semibold">
            {t("settings.profile.heading")}
          </h2>
        </div>
        {!isEditing && !profileQuery.isLoading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {t("settings.profile.edit")}
          </Button>
        )}
      </div>

      {/* Load error: only show red banner for real server errors — network /
          offline errors just render the empty state below. */}
      {profileQuery.isError && !isNetworkError(profileQuery.error) && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {t("settings.profile.error.loadFailed", {
            message: errMsg(profileQuery.error),
          })}
        </div>
      )}

      {isEditing ? (
        <form onSubmit={handleSave} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="profile-username">{t("settings.profile.username")}</Label>
            <Input
              id="profile-username"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (draftError) setDraftError(null);
              }}
              maxLength={USERNAME_MAX + 10}
              placeholder={t("settings.profile.usernamePlaceholder")}
              aria-invalid={Boolean(draftError) || undefined}
              autoFocus
            />
            {draftError && <p className="text-xs text-destructive">{draftError}</p>}
          </div>

          {mutation.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {t("settings.profile.error.saveFailed", { message: errMsg(mutation.error) })}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={mutation.isPending}
            >
              {t("settings.profile.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("settings.profile.saving")}
                </>
              ) : (
                t("settings.profile.save")
              )}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-6 space-y-4">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              {t("settings.profile.username")}
            </dt>
            <dd
              className={
                "mt-2 min-h-[2.625rem] rounded-lg border border-dashed border-border/70 bg-background/30 px-4 py-2.5 text-sm " +
                (username ? "text-foreground" : "italic text-muted-foreground/70")
              }
            >
              {profileQuery.isLoading
                ? t("common.saved").length > 0
                  ? "…"
                  : ""
                : username || t("settings.profile.empty")}
            </dd>
            {lastUpdated && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {t("settings.profile.updatedAt", { time: lastUpdated })}
              </p>
            )}
          </div>
        </dl>
      )}
    </section>
  );
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
