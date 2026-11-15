/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested Supplier search normalization and explicit status, pagination, and sort forwarding.
 * Author review: Reviewed and approved by @ron.
 */
import { SupplierReadRepository } from "./supplier-read.repository";
import { SupplierReadService } from "./supplier-read.service";

describe("SupplierReadService", () => {
  const emptyPage = {
    items: [],
    page: 0,
    size: 12,
    totalItems: 0,
    totalPages: 0,
  };

  it("trims search text and forwards normalized read-layer inputs", async () => {
    const repository = createRepository();
    repository.list.mockResolvedValue(emptyPage);
    const service = new SupplierReadService(repository);

    await service.list({
      q: "  coffee  ",
      status: "ACTIVE",
      page: 0,
      size: 12,
      sort: "name,asc",
    });

    expect(repository.list).toHaveBeenCalledWith({
      q: "coffee",
      buildingCode: undefined,
      category: undefined,
      status: "ACTIVE",
      page: 0,
      size: 12,
      sort: "name,asc",
    });
  });

  it("treats blank search as absent and forwards ARCHIVED selection", async () => {
    const repository = createRepository();
    repository.list.mockResolvedValue(emptyPage);
    const service = new SupplierReadService(repository);

    await service.list({
      q: "  ",
      status: "ARCHIVED",
      page: 2,
      size: 100,
      sort: "updatedAt,desc",
    });

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        q: undefined,
        status: "ARCHIVED",
        page: 2,
        size: 100,
        sort: "updatedAt,desc",
      }),
    );
  });

  it("requires detail status to be selected explicitly", async () => {
    const repository = createRepository();
    repository.findById.mockResolvedValue(null);
    const service = new SupplierReadService(repository);

    await service.findById(
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      "ACTIVE",
    );
    await service.findById(
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      "ARCHIVED",
    );

    expect(repository.findById).toHaveBeenNthCalledWith(
      1,
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      "ACTIVE",
    );
    expect(repository.findById).toHaveBeenNthCalledWith(
      2,
      "ac2288df-661c-5d78-bcc1-ac6bca30fe51",
      "ARCHIVED",
    );
  });

  function createRepository() {
    return {
      list: jest.fn(),
      findById: jest.fn(),
    } as jest.Mocked<SupplierReadRepository>;
  }
});
