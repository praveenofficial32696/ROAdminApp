import { Timestamp } from 'firebase/firestore';

export type ServiceStatus = 'open' | 'InProcess' | 'closed' | 'cancelled' | 'Open' | 'In Process' | 'Closed' | 'Cancelled';
export type ServiceType = 'complaint' | 'service request' | 'installation' | 'Reinstallation' | 'Installation' | 'Reinstallation' | 'Service Request' | 'Repair';
export type PaymentMethod = 'Cash' | 'Online';

export interface Booking {
  id: string; // Document ID
  customerName: string;
  customerAddress: string;
  customerNumber: string;
  bookingId: string;
  bookedDate: Timestamp;
  createdAt: Timestamp;
  status: 'open' | 'InProcess' | 'closed' | 'cancelled';
  serviceType: ServiceType;
  uid: string;
  isComplaint: boolean;
  roModel: string;
  closedDate?: Timestamp;
  technician: {
    name: string;
    phone: string;
    uid?: string;
  };
  billing?: {
    serviceTitle?: string;
    serviceComments?: string;
    serviceFee?: number;
    discount?: number;
    totalAmount?: number;
    spareParts?: { partName: string; price: number }[];
    warranty?: { fromDate: string; toDate: string };
    paymentMethod?: PaymentMethod;
  };
}

export interface Technician {
  id: string;
  name: string;
}

export interface AdminProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  role: string;
}
