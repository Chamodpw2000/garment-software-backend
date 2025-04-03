export function optimizeGarmentCutting(req, res) {


    console.log("Request body:", req.body);
    
    const { orders, maxBlocksPerCut, maxStackingCloth } = req.body;

   
  
    // Calculate total order quantity
  const totalOrderQuantity = Object.values(orders).reduce((sum, qty) => sum + qty, 0);
  
  // Convert orders to array of objects for easier processing
  const orderItems = Object.entries(orders).map(([size, quantity]) => ({
    size,
    quantity,
    remaining: quantity
  }));
  
  // Sort orders by quantity in descending order for better optimization
  orderItems.sort((a, b) => b.quantity - a.quantity);
  
  const cuttingPlan = [];
  let cutNumber = 0;
  
  // Continue until all orders are fulfilled
  while (orderItems.some(item => item.remaining > 0)) {
    cutNumber++;
    
    // Initialize the current cut
    const currentCut = {
      cutNumber,
      stackSize: 0,
      blocks: {}
    };
    
    let blocksUsed = 0;
    
    // First pass: Determine optimal block allocation without setting stack size
    const blockAllocation = {};
    let remainingBlocks = maxBlocksPerCut;
    
    // Sort by remaining quantity for this allocation pass
    const sortedItems = [...orderItems].sort((a, b) => b.remaining - a.remaining);
    
    for (const item of sortedItems) {
      if (item.remaining > 0 && remainingBlocks > 0) {
        // Allocate blocks proportionally to remaining quantities
        const blocksForItem = Math.min(
          Math.ceil(item.remaining / (item.remaining + 1)), // Avoid allocating too many blocks
          remainingBlocks
        );
        
        if (blocksForItem > 0) {
          blockAllocation[item.size] = blocksForItem;
          remainingBlocks -= blocksForItem;
        }
      }
    }
    
    // Second pass: Determine optimal stack size to minimize waste
    // Find the minimum stack size that doesn't exceed any order
    let optimalStackSize = maxStackingCloth;
    
    for (const [size, blocks] of Object.entries(blockAllocation)) {
      const item = orderItems.find(i => i.size === size);
      // Calculate the maximum stack size that won't exceed the order
      const maxStackForItem = Math.ceil(item.remaining / blocks);
      optimalStackSize = Math.min(optimalStackSize, maxStackForItem);
    }
    
    // Ensure stack size is at least 1 but not more than maxStackingCloth
    currentCut.stackSize = Math.max(1, Math.min(optimalStackSize, maxStackingCloth));
    
    // Third pass: Apply the allocation with the determined stack size
    for (const [size, blocks] of Object.entries(blockAllocation)) {
      const item = orderItems.find(i => i.size === size);
      
      // Calculate how many pieces we'll actually produce
      const producedQuantity = Math.min(
        blocks * currentCut.stackSize,
        item.remaining
      );
      
      // Only use as many blocks as needed
      const actualBlocks = Math.ceil(producedQuantity / currentCut.stackSize);
      
      if (actualBlocks > 0) {
        currentCut.blocks[size] = actualBlocks;
        item.remaining -= producedQuantity;
        blocksUsed += actualBlocks;
      }
    }
    
    // If we couldn't allocate any blocks, break to avoid infinite loop
    if (blocksUsed === 0) {
      // Handle edge case: very small remaining quantities
      for (const item of orderItems) {
        if (item.remaining > 0) {
          currentCut.blocks[item.size] = 1;
          currentCut.stackSize = item.remaining;
          item.remaining = 0;
          break;
        }
      }
    }
    
    cuttingPlan.push(currentCut);
  }
  
  // Generate summary
  const summary = Object.entries(orders).map(([size, quantity]) => {
    const sizeCuts = cuttingPlan
      .filter(cut => cut.blocks[size])
      .map(cut => ({
        cutNumber: cut.cutNumber,
        blocks: cut.blocks[size]
      }));
    
    return {
      size,
      quantity,
      cuts: sizeCuts
    };
  });
  
  // Calculate actual production quantities
  const production = {};
  for (const cut of cuttingPlan) {
    for (const [size, blocks] of Object.entries(cut.blocks)) {
      production[size] = (production[size] || 0) + (blocks * cut.stackSize);
    }
  }
  
  // Calculate waste (overproduction)
  let totalWaste = 0;
  for (const [size, quantity] of Object.entries(orders)) {
    const produced = production[size] || 0;
    totalWaste += Math.max(0, produced - quantity);
  }
  
  // Calculate utilization percentages
  const totalBlocksUsed = cuttingPlan.reduce((sum, cut) => 
    sum + Object.values(cut.blocks).reduce((s, b) => s + b, 0), 0);
  const totalBlockCapacity = cuttingPlan.length * maxBlocksPerCut;
  
  const totalStackUsed = cuttingPlan.reduce((sum, cut) => sum + cut.stackSize, 0);
  const totalStackCapacity = cuttingPlan.length * maxStackingCloth;
  
  const blockUtilizationPercent = Math.round((totalBlocksUsed / totalBlockCapacity) * 100);
  const stackUtilizationPercent = Math.round((totalStackUsed / totalStackCapacity) * 100);
  
  // Calculate cloth efficiency
  const totalClothUsed = cuttingPlan.reduce((sum, cut) => {
    return sum + (cut.stackSize * Object.values(cut.blocks).reduce((s, b) => s + b, 0));
  }, 0);
  
  const clothEfficiencyPercent = Math.round(((totalClothUsed - totalWaste) / totalClothUsed) * 100);
  res.status(200).json({totalOrderQuantity,
    totalCuts: cuttingPlan.length,
    cuttingPlan,
    blockUtilizationPercent,
    stackUtilizationPercent,
    clothEfficiencyPercent,
    totalWaste,
    summary})
 
  
}


