namespace PetSmart.Models;

public sealed record Product(int Id, string Name, string Sku, int Quantity, string Status, string Notes, string CreatedAt);
