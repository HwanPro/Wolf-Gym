export interface PendingCredential {
  username: string;
  password: string;
  phone: string;
  message?: string;
  whatsappUrl?: string | null;
  createdAt?: number;
}

export interface ClientFormPayload {
  firstName: string;
  lastName: string;
  username: string;
  phoneNumber: string;
  profile: {
    plan: string;
    startDate: string;
    endDate: string;
    emergencyPhone: string;
    address: string;
    social: string;
    documentNumber: string;
    debt: number;
  };
}

