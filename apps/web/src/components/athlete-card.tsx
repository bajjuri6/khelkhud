import Link from "next/link";
import { formatPaise } from "@khelkhud/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { profilePhotoUrl } from "@/lib/upload";
import { CATEGORY_LABELS } from "@/lib/types";

export type AthleteCardData = {
  id: string;
  name: string;
  avatarUrl: string | null;
  photoKey: string | null;
  sport: { id: string; name: string } | null;
  category: string | null;
  locationLabel: string | null;
  verificationStatus: string;
  topAchievement: string | null;
  openRequirement: {
    id: string;
    title: string;
    totalAmountPaise: number;
    raisedAmountPaise: number;
  } | null;
};

export function AthleteCard({ athlete }: { athlete: AthleteCardData }) {
  const photo = profilePhotoUrl(athlete.photoKey) ?? athlete.avatarUrl;
  const req = athlete.openRequirement;
  const pct =
    req && req.totalAmountPaise > 0
      ? Math.min(100, Math.round((req.raisedAmountPaise / req.totalAmountPaise) * 100))
      : 0;

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 pt-6">
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            {photo ? <AvatarImage src={photo} alt={athlete.name} /> : null}
            <AvatarFallback className="text-lg">{athlete.name[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold">{athlete.name}</span>
              {athlete.verificationStatus === "VERIFIED" ? (
                <span title="Verified" className="text-emerald-600">
                  ✓
                </span>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {[athlete.sport?.name, athlete.category ? CATEGORY_LABELS[athlete.category] : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {athlete.locationLabel ? (
              <p className="truncate text-xs text-muted-foreground">{athlete.locationLabel}</p>
            ) : null}
          </div>
        </div>

        {athlete.topAchievement ? (
          <Badge variant="secondary" className="w-fit max-w-full">
            <span className="truncate">🏆 {athlete.topAchievement}</span>
          </Badge>
        ) : null}

        {req ? (
          <div className="mt-auto">
            <p className="truncate text-sm font-medium">{req.title}</p>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>
                {formatPaise(req.raisedAmountPaise)} / {formatPaise(req.totalAmountPaise)}
              </span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} className="mt-1" />
          </div>
        ) : (
          <p className="mt-auto text-sm text-muted-foreground">No open requirement</p>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full" variant="outline">
          <Link href={`/athletes/${athlete.id}`}>View Profile</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
