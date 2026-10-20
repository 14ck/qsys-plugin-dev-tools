local CurrentPage = PageNames[props["page_index"].Value]

local Colors = {
  Box = { 230, 230, 230 },
  Text = { 0, 0, 0 }
}

-- Adds a right-aligned label to the graphics table
local function AddLabel(text, x, y, w)
  table.insert(graphics, {
    Type = "Text",
    Text = text,
    Position = { x, y },
    Size = { w or 100, 16 },
    FontSize = 12,
    HTextAlign = "Right",
    Color = Colors.Text
  })
end

if CurrentPage == "Control" then
  table.insert(graphics, {
    Type = "GroupBox",
    Text = "Qsys Plugin Dev Tools",
    Fill = Colors.Box,
    StrokeWidth = 1,
    CornerRadius = 4,
    HTextAlign = "Left",
    Position = { 5, 5 },
    Size = { 330, 60 },
    StrokeColor = { 72, 78, 88 },
    Color = { 230, 233, 237 }
  })
  AddLabel("Status", 10, 30, 60)
  layout["Status"] = {
    PrettyName = "Status",
    Style = "Text",
    Position = { 75, 30 },
    Size = { 250, 16 }
  }

  table.insert(graphics, 1, { Type = "GroupBox", Position = { 0, 0 }, Size = { 345, 75 }, Fill = { 38, 42, 49 }, StrokeWidth = 0 })
end
