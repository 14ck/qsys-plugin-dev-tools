-- Debug output level for the runtime script
table.insert(props, {
  Name = "Debug Print",
  Type = "enum",
  Choices = { "None", "Tx", "Rx", "All" },
  Value = "None"
})
