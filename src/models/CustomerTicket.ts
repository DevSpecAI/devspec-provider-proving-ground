import { Schema, model } from 'mongoose';

const CustomerTicketSchema = new Schema(
  {
    externalId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    status: { type: String, enum: ['open', 'triaged', 'resolved'], default: 'open', index: true },
    priority: { type: Number, default: 2 },
    reporterEmail: { type: String, required: true },
    tags: [{ type: String }],
  },
  { timestamps: true, collection: 'customer_tickets' }
);

CustomerTicketSchema.index({ status: 1, priority: -1 });

export const CustomerTicket = model('CustomerTicket', CustomerTicketSchema);
