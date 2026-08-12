import { expect, it, vi } from "vitest";

const { createSupabaseServerClient, from, getUser, rpc } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("sharp", () => {
  throw new Error("native image runtime unavailable");
});
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

it("lists media without loading the native image processor", async () => {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const is = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ is });
  from.mockReturnValue({ select });
  getUser.mockResolvedValue({
    data: { user: { id: "10000000-0000-4000-8000-000000000001" } },
    error: null
  });
  rpc.mockResolvedValue({ data: true, error: null });
  createSupabaseServerClient.mockResolvedValue({ auth: { getUser }, from, rpc });

  const routeModule = import("@/app/api/admin/media/route");
  await expect(routeModule).resolves.toHaveProperty("GET");
  const { GET } = await routeModule;
  const response = await GET(new Request("http://localhost/api/admin/media"));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ items: [] });
});
