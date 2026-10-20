-- Build the page list from PageNames (defined in plugin.lua)
for _, name in ipairs(PageNames) do
  table.insert(pages, { name = name })
end
