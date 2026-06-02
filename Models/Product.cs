namespace PetSmart.Models;

public sealed record Product(int Id, string Name, string Type, int Quantity, string Status, string Notes, string CreatedAt);
