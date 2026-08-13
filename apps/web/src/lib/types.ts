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

export type AthleteEvent = {
  id: string;
  name: string;
  date: string | null;
  venue: string | null;
  result: string | null;
  estimatedExpensePaise: number | null;
  isUpcoming: boolean;
};

export type RequestItem = {
  id: string;
  label: string;
  quantity: number;
  estimatedPaise: number;
  fulfilledQty: number;
  note: string | null;
};

export type Request = {
  id: string;
  kind: "EQUIPMENT" | "CASH";
  title: string;
  description: string | null;
  totalEstimatedPaise: number;
  raisedAmountPaise: number;
  status:
    | "DRAFT"
    | "PENDING_VALIDATION"
    | "REJECTED"
    | "OPEN"
    | "PARTIALLY_FULFILLED"
    | "FULFILLED"
    | "CLOSED";
  items: RequestItem[];
  deadline: string | null;
};

export type AthleteProfileMe = {
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
  events: AthleteEvent[];
  requests: Request[];
};

export type PublicAthlete = {
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
  events: AthleteEvent[];
  requests: Request[];
};

export type AttachmentRef = { id: string; fileName: string; mimeType: string; kind: string };

export type Allocation = {
  id: string;
  label: string;
  amountPaise: number;
  status: "PLANNED" | "PURCHASED" | "COMPLETED";
  receiptDocumentId: string | null;
  note: string | null;
  completedAt: string | null;
};

export type SponsorshipUpdateEntry = {
  id: string;
  title: string;
  body: string;
  sponsorshipId: string | null;
  createdAt: string;
  attachments: AttachmentRef[];
};

export type SponsorshipDetail = {
  id: string;
  code: string;
  amountPaise: number;
  purpose: string;
  isAnonymous: boolean;
  status: string;
  paymentStatus: string;
  utilizationStatus: string;
  createdAt: string;
  sponsor: {
    displayName: string | null;
    sponsorType?: string;
    orgName?: string | null;
    user: { name: string; avatarUrl: string | null };
  };
  athlete: { id: string; name: string; avatarUrl: string | null; photoKey: string | null };
  request: Request | null;
  allocations: Allocation[];
  updates: SponsorshipUpdateEntry[];
  documents: AttachmentRef[];
  transactions?: {
    id: string;
    status: string;
    amountPaise: number;
    provider: string;
    providerPaymentId: string | null;
    occurredAt: string;
  }[];
  viewer: { isSponsor: boolean; isAthlete: boolean; isAdmin: boolean };
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
