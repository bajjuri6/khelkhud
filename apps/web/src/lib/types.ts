export type Sport = { id: string; name: string; slug: string };

export type Location = {
  id: string;
  name: string;
  level: "STATE" | "DISTRICT" | "CITY";
  parentId: string | null;
};

export type Achievement = {
  id: string;
  title: string;
  level: string | null;
  year: number | null;
  description: string | null;
  proofDocumentId: string | null;
};

export type PlayerEvent = {
  id: string;
  name: string;
  date: string | null;
  venue: string | null;
  result: string | null;
  estimatedExpensePaise: number | null;
  isUpcoming: boolean;
};

export type BreakdownItem = { label: string; amountPaise: number };

export type Requirement = {
  id: string;
  title: string;
  description: string | null;
  totalAmountPaise: number;
  raisedAmountPaise: number;
  status: "OPEN" | "PARTIALLY_FUNDED" | "FULLY_FUNDED" | "CLOSED";
  breakdown: BreakdownItem[] | null;
  deadline: string | null;
};

export type PlayerProfileMe = {
  id: string;
  sportId: string | null;
  locationId: string | null;
  dateOfBirth: string | null;
  category: string | null;
  experienceLevel: string | null;
  bio: string | null;
  photoKey: string | null;
  coachName: string | null;
  coachContact: string | null;
  academyName: string | null;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | "INFO_REQUESTED";
  user: { name: string; email: string; avatarUrl: string | null };
  achievements: Achievement[];
  events: PlayerEvent[];
  requirements: Requirement[];
};

export type PublicPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  photoKey: string | null;
  sport: Sport | null;
  location: Location | null;
  locationLabel: string | null;
  age: number | null;
  category: string | null;
  experienceLevel: string | null;
  bio: string | null;
  academyName: string | null;
  coachName: string | null;
  verificationStatus: string;
  achievements: Achievement[];
  events: PlayerEvent[];
  requirements: Requirement[];
};

export const CATEGORY_LABELS: Record<string, string> = {
  UNDER_12: "Under 12",
  UNDER_15: "Under 15",
  UNDER_19: "Under 19",
  SENIOR: "Senior",
  PARA: "Para athlete",
};

export const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Beginner",
  DISTRICT: "District",
  STATE: "State",
  NATIONAL: "National",
  INTERNATIONAL: "International",
};
