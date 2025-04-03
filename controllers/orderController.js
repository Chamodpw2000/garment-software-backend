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
  orderItems.sort((a, b) => b.quantity - a.remaining);

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
    
    // Determine optimal stack size for this cut
    // Default to maximum allowed
    let optimalStackSize = maxStackingCloth;
    
    // Sort items by remaining quantity for this allocation
    const sortedItems = [...orderItems]
      .filter(item => item.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);
    
    if (sortedItems.length === 0) break; // No more items to process
    
    // Allocate blocks based on remaining quantities
    let remainingBlocks = maxBlocksPerCut;
    let blocksAllocated = false;
    
    // First pass: Allocate blocks to sizes with the most remaining items
    for (const item of sortedItems) {
      if (item.remaining > 0 && remainingBlocks > 0) {
        // Calculate how many blocks we need for this size
        // We want to use as many blocks as needed to fulfill the order
        const idealBlocksNeeded = Math.ceil(item.remaining / maxStackingCloth);
        
        // Allocate as many blocks as we can, up to what's needed
        const blocksToAllocate = Math.min(idealBlocksNeeded, remainingBlocks);
        
        if (blocksToAllocate > 0) {
          currentCut.blocks[item.size] = blocksToAllocate;
          remainingBlocks -= blocksToAllocate;
          blocksAllocated = true;
        }
      }
    }
    
    // If we couldn't allocate any blocks in the first pass, allocate at least one
    // block to the item with the largest remaining quantity
    if (!blocksAllocated && sortedItems.length > 0) {
      const largestItem = sortedItems[0];
      currentCut.blocks[largestItem.size] = 1;
      remainingBlocks--;
      blocksAllocated = true;
    }
    
    // Second pass: Determine optimal stack size to minimize waste
    // Start with the maximum allowed stack size
    optimalStackSize = maxStackingCloth;
    
    // For each size in this cut, find the stack size that doesn't exceed the order
    for (const [size, blocks] of Object.entries(currentCut.blocks)) {
      const item = orderItems.find(i => i.size === size);
      if (item) {
        // Calculate the maximum stack size that won't exceed the order
        const maxStackForItem = Math.ceil(item.remaining / blocks);
        optimalStackSize = Math.min(optimalStackSize, maxStackForItem);
      }
    }
    
    // Ensure stack size is at least 1
    currentCut.stackSize = Math.max(1, optimalStackSize);
    
    // Third pass: Update remaining quantities based on what we'll produce
    for (const [size, blocks] of Object.entries(currentCut.blocks)) {
      const item = orderItems.find(i => i.size === size);
      if (item) {
        // Calculate how many pieces we'll produce
        const producedQuantity = blocks * currentCut.stackSize;
        
        // Update remaining quantity
        item.remaining = Math.max(0, item.remaining - producedQuantity);
      }
    }
    
    // Add this cut to the plan
    cuttingPlan.push(currentCut);
    
    // Verify we're making progress
    const totalRemaining = orderItems.reduce((sum, item) => sum + item.remaining, 0);
    if (totalRemaining === totalOrderQuantity) {
      // We didn't make any progress, force progress on the largest remaining item
      const largestItem = orderItems
        .filter(item => item.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining)[0];
      
      if (largestItem) {
        // Create a special cut just for this item
        cutNumber++;
        const specialCut = {
          cutNumber,
          stackSize: Math.min(largestItem.remaining, maxStackingCloth),
          blocks: { [largestItem.size]: 1 }
        };
        
        // Update remaining
        largestItem.remaining -= specialCut.stackSize;
        
        // Add to cutting plan
        cuttingPlan.push(specialCut);
      }
    }
  }

  // Double-check that all orders are fulfilled
  // If not, add additional cuts to fulfill remaining orders
  for (const item of orderItems) {
    while (item.remaining > 0) {
      cutNumber++;
      
      // Create a cut specifically for this remaining item
      const stackSize = Math.min(item.remaining, maxStackingCloth);
      const specialCut = {
        cutNumber,
        stackSize,
        blocks: { [item.size]: 1 }
      };
      
      // Update remaining
      item.remaining -= stackSize;
      
      // Add to cutting plan
      cuttingPlan.push(specialCut);
    }
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

  // Verify all orders are fulfilled
  let allOrdersFulfilled = true;
  for (const [size, quantity] of Object.entries(orders)) {
    const produced = production[size] || 0;
    if (produced < quantity) {
      console.error(`Error: Not enough ${size} produced. Ordered: ${quantity}, Produced: ${produced}`);
      allOrdersFulfilled = false;
    }
  }

  if (!allOrdersFulfilled) {
    console.error("Warning: Not all orders were fulfilled in the cutting plan");
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
  
  const clothEfficiencyPercent = totalClothUsed > 0 
    ? Math.round(((totalClothUsed - totalWaste) / totalClothUsed) * 100)
    : 100;

  // Add production quantities to the response for verification
  const productionVerification = {};
  for (const [size, quantity] of Object.entries(orders)) {
    productionVerification[size] = {
      ordered: quantity,
      produced: production[size] || 0
    };
  }

  res.status(200).json({
    totalOrderQuantity,
    totalCuts: cuttingPlan.length,
    cuttingPlan,
    blockUtilizationPercent,
    stackUtilizationPercent,
    clothEfficiencyPercent,
    totalWaste,
    summary,
    productionVerification // Added for debugging
  });
}
