import api from './api';
import type {
  ApiResponse,
  BillableItem,
  BillingPayment,
  BillingStats,
  CreateInvoicePayload,
  Invoice,
  InvoicesListData,
  InvoicesQuery,
  PaymentsListData,
  PaymentsQuery,
  RecordPaymentPayload,
} from '../types';

export const createInvoice = async (payload: CreateInvoicePayload): Promise<Invoice> => {
  const { data } = await api.post<ApiResponse<{ invoice: Invoice }>>(
    '/billing/invoices',
    payload
  );
  return data.data.invoice;
};

export const getInvoices = async (params: InvoicesQuery = {}): Promise<InvoicesListData> => {
  const { data } = await api.get<ApiResponse<InvoicesListData>>('/billing/invoices', { params });
  return data.data;
};

export const getInvoiceById = async (
  id: string
): Promise<{ invoice: Invoice; payments: BillingPayment[] }> => {
  const { data } = await api.get<ApiResponse<{ invoice: Invoice; payments: BillingPayment[] }>>(
    `/billing/invoices/${id}`
  );
  return data.data;
};

export const updateDraftInvoice = async (
  id: string,
  payload: Pick<CreateInvoicePayload, 'items' | 'discount' | 'tax'>
): Promise<Invoice> => {
  const { data } = await api.patch<ApiResponse<{ invoice: Invoice }>>(
    `/billing/invoices/${id}`,
    payload
  );
  return data.data.invoice;
};

export const setInvoiceStatus = async (
  id: string,
  status: 'issued' | 'cancelled'
): Promise<Invoice> => {
  const { data } = await api.patch<ApiResponse<{ invoice: Invoice }>>(
    `/billing/invoices/${id}/status`,
    { status }
  );
  return data.data.invoice;
};

export const getBillableSources = async (patientId: string): Promise<BillableItem[]> => {
  const { data } = await api.get<ApiResponse<{ billables: BillableItem[] }>>(
    `/billing/billable/${patientId}`
  );
  return data.data.billables;
};

export const recordPayment = async (payload: RecordPaymentPayload): Promise<BillingPayment> => {
  const { data } = await api.post<ApiResponse<{ payment: BillingPayment }>>(
    '/billing/payments',
    payload
  );
  return data.data.payment;
};

export const getPayments = async (params: PaymentsQuery = {}): Promise<PaymentsListData> => {
  const { data } = await api.get<ApiResponse<PaymentsListData>>('/billing/payments', { params });
  return data.data;
};

export const recordRefund = async (payload: {
  paymentId: string;
  amount: number;
  notes?: string;
}): Promise<BillingPayment> => {
  const { data } = await api.post<ApiResponse<{ refund: BillingPayment }>>(
    '/billing/refunds',
    payload
  );
  return data.data.refund;
};

export const getBillingStats = async (): Promise<BillingStats> => {
  const { data } = await api.get<ApiResponse<BillingStats>>('/billing/stats');
  return data.data;
};

// Currency comes from system settings, so the formatter lives in utils/money
// and is re-exported here for the existing billing call sites.
export { formatMoney } from '../utils/money';
