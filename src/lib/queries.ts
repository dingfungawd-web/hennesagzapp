import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Order, Team, Technician, ImportBatch } from "./domain";

export function useOrders(filters?: { status?: string; geoStatus?: string; installDate?: string }) {
  return useQuery({
    queryKey: ["orders", filters ?? {}],
    queryFn: async (): Promise<Order[]> => {
      let q = supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.geoStatus) q = q.eq("geo_status", filters.geoStatus);
      if (filters?.installDate) q = q.eq("install_date", filters.installDate);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase.from("teams").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async (): Promise<Technician[]> => {
      const { data, error } = await supabase.from("technicians").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ["import_batches"],
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCancelImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.rpc("cancel_import_batch", { _batch_id: batchId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["orders"] }),
        qc.invalidateQueries({ queryKey: ["import_batches"] }),
      ]);
    },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Order> }) => {
      // 任何触及「期」相关栏位嘅更新都视为需要同步去 app：标记待同步并重置已入 app
      const isScheduleAction =
        "install_date" in patch || "install_time" in patch || "team_id" in patch;
      const update = isScheduleAction
        ? { ...patch, app_sync_pending: true, in_app: false }
        : patch;
      const { error } = await supabase.from("orders").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
