import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),toast:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mocks.rpc}}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:{id:"synthetic-operator"},loading:false})}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:mocks.toast})}));
let Drawer: typeof import("@/components/crm/PendingRevendaMaisLeads").PendingRevendaMaisLeads;
const id="a0000000-0000-4000-8000-000000000001";
const item={receipt_id:id,name:"Pessoa Fictícia",phone:null,email:null,title:"Interesse fictício",portal:null,channel_name:null,
  source_created_at:null,received_at:"2026-09-17T11:49:53Z",attempt_count:4,identity_status:"consistent",approval_blocker:null};
beforeAll(async()=>{vi.stubEnv("VITE_REVENDAMAIS_REVIEW_ENABLED","true");Drawer=(await import("@/components/crm/PendingRevendaMaisLeads")).PendingRevendaMaisLeads;});
afterAll(()=>vi.unstubAllEnvs());
beforeEach(()=>{mocks.rpc.mockReset();mocks.toast.mockReset();mocks.rpc.mockResolvedValue({data:{total:1,items:[item]},error:null});});
afterEach(cleanup);
async function openDrawer(){fireEvent.click(screen.getByRole("button",{name:/Leads Pendentes/}));await screen.findByText("Pessoa Fictícia");}
describe("gaveta de revisão (RPCs simuladas, sem acesso ao banco)",()=>{
  it("requires explicit confirmation, waits for durable result and refreshes deals",async()=>{
    const refresh=vi.fn().mockResolvedValue(undefined);let finish!: (v:unknown)=>void;
    mocks.rpc.mockImplementation((name:string)=>name==="approve_revendamais_lead" ? new Promise(r=>{finish=r;}) : Promise.resolve({data:{total:1,items:[item]},error:null}));
    render(<Drawer onApproved={refresh}/>);await openDrawer();
    fireEvent.click(screen.getByRole("button",{name:/Pessoa Fictícia/}));
    fireEvent.click(screen.getByRole("button",{name:"Aprovar e Criar Negócio"}));
    expect(mocks.rpc.mock.calls.filter(([name])=>name==="approve_revendamais_lead")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button",{name:"Confirmar aprovação"}));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button",{name:"Aprovando…"})).toBeDisabled();
    finish({data:{status:"approved",contact_id:id,deal_id:id},error:null});
    await waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("approve_revendamais_lead",{p_receipt_id:id});
  });
  it.each(["already_processed","conflict"])("handles %s without inventing a new success",async status=>{
    const refresh=vi.fn().mockResolvedValue(undefined);
    mocks.rpc.mockImplementation((name:string)=>Promise.resolve({data:name==="approve_revendamais_lead" ? status==="conflict" ? {status,code:"ambiguous_contact"} : {status,contact_id:id,deal_id:id} : {total:1,items:[item]},error:null}));
    render(<Drawer onApproved={refresh}/>);await openDrawer();fireEvent.click(screen.getByRole("button",{name:/Pessoa Fictícia/}));
    fireEvent.click(screen.getByRole("button",{name:"Aprovar e Criar Negócio"}));fireEvent.click(screen.getByRole("button",{name:"Confirmar aprovação"}));
    if(status==="conflict"){expect(await screen.findByRole("alert")).toHaveTextContent("Mais de um contato");expect(refresh).not.toHaveBeenCalled();}
    else await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({title:"Lead já processado"})));
  });
  it("shows missing RPC as unavailable, never empty success",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"PGRST202"}});render(<Drawer onApproved={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:/Leads Pendentes/}));
    expect(await screen.findByRole("alert")).toHaveTextContent("ainda não está disponível");
    expect(screen.queryByText("Nenhum lead pendente de revisão.")).not.toBeInTheDocument();
  });
  it("shows empty state only for confirmed total zero",async()=>{
    mocks.rpc.mockResolvedValue({data:{total:0,items:[]},error:null});render(<Drawer onApproved={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:/Leads Pendentes/}));expect(await screen.findByText("Nenhum lead pendente de revisão.")).toBeInTheDocument();
  });
});
