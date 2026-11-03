import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { GripVertical, UserX } from "lucide-react";
import {
  DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import type { Database } from "@/integrations/supabase/types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type ContactStatus = Database["public"]["Enums"]["contact_status"];

const statusColors: Record<ContactStatus, string> = {
  lead: "bg-primary/10 text-primary",
  prospect: "bg-warning/10 text-warning",
  customer: "bg-success/10 text-success",
  churned: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<ContactStatus, string> = {
  lead: "Lead", prospect: "Prospect", customer: "Cliente", churned: "Churned",
};

function ContactCard({
  contact,
  company,
  onClick,
}: {
  contact: Contact;
  company?: Company | null;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: contact.id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="group">
      <Card
        className="cursor-pointer border-border bg-card transition-all hover:shadow-md"
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <button
              {...listeners}
              className="mt-0.5 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex-1 overflow-hidden space-y-1">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                    {contact.first_name[0]}{contact.last_name?.[0] || ""}
                  </AvatarFallback>
                </Avatar>
                <p className="truncate text-sm font-medium">{contact.first_name} {contact.last_name}</p>
              </div>
              {company && (
                <p className="truncate text-xs text-muted-foreground">{company.name}</p>
              )}
              {contact.email && (
                <p className="truncate text-xs text-muted-foreground">{contact.email}</p>
              )}
              <Badge variant="secondary" className={`text-[10px] ${statusColors[contact.status || "lead"]}`}>
                {statusLabels[contact.status || "lead"]}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OwnerColumn({
  owner,
  contacts,
  companies,
  onContactClick,
}: {
  owner: { id: string; name: string; avatar_url?: string | null } | null;
  contacts: Contact[];
  companies: Company[];
  onContactClick: (c: Contact) => void;
}) {
  const columnId = owner?.id || "unassigned";
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[260px] sm:w-[280px] shrink-0 flex-col rounded-lg border border-border transition-colors ${
        isOver ? "bg-primary/5 border-primary/30" : "bg-muted/20"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {owner ? (
            <Avatar className="h-6 w-6">
              <AvatarImage src={owner.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                {owner.name?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
              <UserX className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <h3 className="text-sm font-semibold truncate max-w-[140px]">
            {owner?.name || "Sem responsável"}
          </h3>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {contacts.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-1.5 p-2 overflow-y-auto max-h-[calc(100vh-260px)]">
        {contacts.map((contact) => (
          <ContactCard
            key={contact.id}
            contact={contact}
            company={companies.find((c) => c.id === contact.company_id)}
            onClick={() => onContactClick(contact)}
          />
        ))}
        {contacts.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Arraste leads aqui
          </p>
        )}
      </div>
    </div>
  );
}

interface ContactsKanbanByOwnerProps {
  contacts: Contact[];
  members: Profile[];
  companies: Company[];
  onContactClick: (c: Contact) => void;
  onOwnerChange: (contactId: string, newOwnerId: string | null) => void;
}

export function ContactsKanbanByOwner({
  contacts,
  members,
  companies,
  onContactClick,
  onOwnerChange,
}: ContactsKanbanByOwnerProps) {
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  const handleDragStart = (event: DragStartEvent) => {
    const contact = contacts.find((c) => c.id === event.active.id);
    setActiveContact(contact || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveContact(null);
    const { active, over } = event;
    if (!over) return;
    const contactId = active.id as string;
    const targetOwnerId = over.id as string;
    const newOwnerId = targetOwnerId === "unassigned" ? null : targetOwnerId;

    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    if (contact.owner_id === newOwnerId) return;

    onOwnerChange(contactId, newOwnerId);
  };

  // Build columns: "unassigned" + each member that has contacts or exists
  const membersWithContacts = new Set(
    contacts.map((c) => c.owner_id).filter(Boolean)
  );
  const visibleMembers = members.filter(
    (m) => membersWithContacts.has(m.id) || true // show all members
  );

  const unassignedContacts = contacts.filter((c) => !c.owner_id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {/* Unassigned column */}
        <OwnerColumn
          owner={null}
          contacts={unassignedContacts}
          companies={companies}
          onContactClick={onContactClick}
        />

        {/* One column per member */}
        {visibleMembers.map((member) => (
          <OwnerColumn
            key={member.id}
            owner={{ id: member.id, name: member.name || member.email || "?", avatar_url: member.avatar_url }}
            contacts={contacts.filter((c) => c.owner_id === member.id)}
            companies={companies}
            onContactClick={onContactClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeContact && (
          <div className="w-[260px] opacity-90">
            <Card className="border-primary bg-card shadow-lg">
              <CardContent className="p-3">
                <p className="text-sm font-medium">
                  {activeContact.first_name} {activeContact.last_name}
                </p>
                <p className="text-xs text-muted-foreground">{activeContact.email}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
