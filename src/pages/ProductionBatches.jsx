import React, { useState, useEffect } from 'react';
import { Plus, Search, Eye, CheckCircle, RotateCcw, Trash2, Calendar, X, Sparkles, Scale, DollarSign, ChevronRight, ChevronLeft, ArrowRight } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

const ProductionBatches = () => {
    const { profile } = useAuth();
    const isAccountsOrAdmin = ['ADMIN', 'ACCOUNTS'].includes(profile?.role);
    const isAdmin = profile?.role === 'ADMIN';

    // State lists
    const [batches, setBatches] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedBatchId, setExpandedBatchId] = useState(null);

    // Filter and search
    const [searchTerm, setSearchTerm] = useState('');
    const [processFilter, setProcessFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Expand details state
    const [batchDetails, setBatchDetails] = useState({ inputs: [], outputs: [] });
    const [detailsLoading, setDetailsLoading] = useState(false);

    // Wizard step state
    const [wizardStep, setWizardStep] = useState(1); // Step 1: Process type, Step 2: Input weight, Step 3: Costing & Review

    // Form data state
    const [formData, setFormData] = useState({
        batch_number: '',
        process_type: 'MILLING', // MILLING, SORTING
        production_date: new Date().toISOString().split('T')[0],
        costing_method: 'WEIGHT_PROPORTION', // WEIGHT_PROPORTION, MARKET_VALUE
        labor_charge: 0,
        other_charges: 0,
        note: '',
        // Single Input fields
        input_product_id: '',
        input_bags: 16.67,
        input_bag_weight: 60,
        input_quantity_kg: 1000
    });

    // Outputs listing (fixed list generated from standard ratios, editable by user)
    const [outputs, setOutputs] = useState([]);

    // Stats state
    const [stats, setStats] = useState({
        totalBatches: 0,
        completedBatches: 0,
        totalPaddyProcessed: 0,
        totalRiceProduced: 0
    });

    useEffect(() => {
        fetchBatches();
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const { data } = await supabase.from('products').select('*').order('name', { ascending: true });
            if (data) setProducts(data);
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    const fetchBatches = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('production_batches')
                .select('*')
                .order('production_date', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                setBatches(data);
                calculateStats(data);
            }
        } catch (error) {
            console.error('Error fetching batches:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (batchList) => {
        const completed = batchList.filter(b => b.status === 'COMPLETED');
        const paddyTotal = completed
            .filter(b => b.process_type === 'MILLING')
            .reduce((sum, b) => sum + parseFloat(b.total_input_weight || 0), 0);
        const riceTotal = completed
            .reduce((sum, b) => sum + parseFloat(b.total_output_weight || 0), 0);

        setStats({
            totalBatches: batchList.length,
            completedBatches: completed.length,
            totalPaddyProcessed: paddyTotal,
            totalRiceProduced: riceTotal
        });
    };

    const fetchBatchSubItems = async (batchId) => {
        setDetailsLoading(true);
        try {
            const { data: inputsData } = await supabase
                .from('production_inputs')
                .select('*, product:product_id(name, unit)')
                .eq('batch_id', batchId);
            
            const { data: outputsData } = await supabase
                .from('production_outputs')
                .select('*, product:product_id(name, unit)')
                .eq('batch_id', batchId);

            setBatchDetails({
                inputs: inputsData || [],
                outputs: outputsData || []
            });
        } catch (error) {
            console.error('Error loading batch sub-items:', error);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleRowExpand = async (batchId) => {
        if (expandedBatchId === batchId) {
            setExpandedBatchId(null);
        } else {
            setExpandedBatchId(batchId);
            await fetchBatchSubItems(batchId);
        }
    };

    const generateBatchNumber = (type) => {
        const prefix = type === 'MILLING' ? 'MIL' : 'SRT';
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `${prefix}-${dateStr}-${rand}`;
    };

    // Smart product lookup
    const lookupProductByKeyword = (keyword, inventoryType) => {
        if (!products.length) return '';
        // Prioritize type and name keyword
        const found = products.find(p => p.inventory_type === inventoryType && p.name.toLowerCase().includes(keyword.toLowerCase())) ||
                      products.find(p => p.name.toLowerCase().includes(keyword.toLowerCase()));
        return found ? found.id : '';
    };

    const handleOpenModal = () => {
        const type = 'MILLING';
        const batchNo = generateBatchNumber(type);
        const paddyId = lookupProductByKeyword('paddy', 'RAW_MATERIAL');

        setFormData({
            batch_number: batchNo,
            process_type: type,
            production_date: new Date().toISOString().split('T')[0],
            costing_method: 'WEIGHT_PROPORTION',
            labor_charge: 0,
            other_charges: 0,
            note: '',
            input_product_id: paddyId,
            input_bags: 16.67,
            input_bag_weight: 60,
            input_quantity_kg: 1000
        });

        setWizardStep(1);
        setIsModalOpen(true);
        // Pre-compute output list based on 1000kg paddy milling ratio
        recalculateOutputsList(type, 1000);
    };

    // Standard yields list generator
    const recalculateOutputsList = (processType, inputWeightKg) => {
        if (processType === 'MILLING') {
            const unsortedId = lookupProductByKeyword('unsorted', 'SEMI_FINISHED');
            const branId = lookupProductByKeyword('bran', 'FINISHED_GOOD');
            const huskId = lookupProductByKeyword('husk', 'FINISHED_GOOD');
            const brokenId = lookupProductByKeyword('broken', 'FINISHED_GOOD');
            const motaId = lookupProductByKeyword('mota', 'FINISHED_GOOD');

            setOutputs([
                { name: 'Produced Unsorted Rice', keyword: 'unsorted', product_id: unsortedId, ratio: 0.67, quantity_kg: inputWeightKg * 0.67, bag_weight: 50, bags: (inputWeightKg * 0.67) / 50, market_value: 2400 },
                { name: 'Rice Bran', keyword: 'bran', product_id: branId, ratio: 0.08, quantity_kg: inputWeightKg * 0.08, bag_weight: 25, bags: (inputWeightKg * 0.08) / 25, market_value: 400 },
                { name: 'Rice Husk (Tush)', keyword: 'husk', product_id: huskId, ratio: 0.20, quantity_kg: inputWeightKg * 0.20, bag_weight: 25, bags: (inputWeightKg * 0.20) / 25, market_value: 150 },
                { name: 'Broken Rice', keyword: 'broken', product_id: brokenId, ratio: 0.03, quantity_kg: inputWeightKg * 0.03, bag_weight: 50, bags: (inputWeightKg * 0.03) / 50, market_value: 1200 },
                { name: 'Mota Rice', keyword: 'mota', product_id: motaId, ratio: 0.02, quantity_kg: inputWeightKg * 0.02, bag_weight: 50, bags: (inputWeightKg * 0.02) / 50, market_value: 1800 }
            ]);
        } else {
            // SORTING
            const premiumId = lookupProductByKeyword('premium', 'FINISHED_GOOD');
            const khudId = lookupProductByKeyword('khud', 'FINISHED_GOOD');
            const moraId = lookupProductByKeyword('mora', 'FINISHED_GOOD');
            const motaId = lookupProductByKeyword('mota', 'FINISHED_GOOD');
            const graderId = lookupProductByKeyword('grader', 'FINISHED_GOOD');
            const looseId = lookupProductByKeyword('loose', 'FINISHED_GOOD');

            setOutputs([
                { name: 'Premium Rice', keyword: 'premium', product_id: premiumId, ratio: 0.806, quantity_kg: inputWeightKg * 0.806, bag_weight: 50, bags: (inputWeightKg * 0.806) / 50, market_value: 3200 },
                { name: 'Khud (Broken)', keyword: 'khud', product_id: khudId, ratio: 0.037, quantity_kg: inputWeightKg * 0.037, bag_weight: 50, bags: (inputWeightKg * 0.037) / 50, market_value: 1000 },
                { name: 'Mora Rice', keyword: 'mora', product_id: moraId, ratio: 0.045, quantity_kg: inputWeightKg * 0.045, bag_weight: 50, bags: (inputWeightKg * 0.045) / 50, market_value: 1100 },
                { name: 'Mota Rice', keyword: 'mota', product_id: motaId, ratio: 0.030, quantity_kg: inputWeightKg * 0.030, bag_weight: 50, bags: (inputWeightKg * 0.030) / 50, market_value: 1800 },
                { name: 'Grader Rice', keyword: 'grader', product_id: graderId, ratio: 0.052, quantity_kg: inputWeightKg * 0.052, bag_weight: 50, bags: (inputWeightKg * 0.052) / 50, market_value: 2800 },
                { name: 'Loose Stock', keyword: 'loose', product_id: looseId, ratio: 0.030, quantity_kg: inputWeightKg * 0.030, bag_weight: 50, bags: (inputWeightKg * 0.030) / 50, market_value: 2500 }
            ]);
        }
    };

    const handleProcessSelect = (type) => {
        const batchNo = generateBatchNumber(type);
        const inputProdId = type === 'MILLING' 
            ? lookupProductByKeyword('paddy', 'RAW_MATERIAL')
            : lookupProductByKeyword('unsorted', 'SEMI_FINISHED');
        
        const bagWeight = type === 'MILLING' ? 60 : 50;
        const initialWeight = type === 'MILLING' ? 1000 : 670;

        setFormData(prev => ({
            ...prev,
            process_type: type,
            batch_number: batchNo,
            input_product_id: inputProdId,
            input_bag_weight: bagWeight,
            input_quantity_kg: initialWeight,
            input_bags: parseFloat((initialWeight / bagWeight).toFixed(2)),
            costing_method: type === 'MILLING' ? 'WEIGHT_PROPORTION' : 'MARKET_VALUE'
        }));

        recalculateOutputsList(type, initialWeight);
        setWizardStep(2);
    };

    const handleInputQuantityChange = (field, value) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            
            // Sync bags and weight
            if (field === 'input_bags' || field === 'input_bag_weight') {
                const bags = parseFloat(updated.input_bags || 0);
                const wt = parseFloat(updated.input_bag_weight || 50);
                updated.input_quantity_kg = parseFloat((bags * wt).toFixed(3));
            } else if (field === 'input_quantity_kg') {
                const kg = parseFloat(updated.input_quantity_kg || 0);
                const wt = parseFloat(updated.input_bag_weight || 50);
                updated.input_bags = parseFloat((kg / wt).toFixed(2));
            }

            // Sync outputs yield based on standard ratios
            setOutputs(prevOutputs => prevOutputs.map(out => {
                const newQty = parseFloat((updated.input_quantity_kg * out.ratio).toFixed(3));
                return {
                    ...out,
                    quantity_kg: newQty,
                    bags: parseFloat((newQty / out.bag_weight).toFixed(2))
                };
            }));

            return updated;
        });
    };

    const handleOutputFieldChange = (idx, field, value) => {
        setOutputs(prev => prev.map((item, i) => {
            if (i === idx) {
                const updated = { ...item, [field]: value };
                if (field === 'bags' || field === 'bag_weight') {
                    const bags = parseFloat(updated.bags || 0);
                    const wt = parseFloat(updated.bag_weight || 50);
                    updated.quantity_kg = parseFloat((bags * wt).toFixed(3));
                } else if (field === 'quantity_kg') {
                    const kg = parseFloat(updated.quantity_kg || 0);
                    const wt = parseFloat(updated.bag_weight || 50);
                    updated.bags = parseFloat((kg / wt).toFixed(2));
                }
                return updated;
            }
            return item;
        }));
    };

    // Live costing maths
    const getCostingSummary = () => {
        const inputProduct = products.find(p => p.id === formData.input_product_id);
        const inputRate = inputProduct?.cost_price || 0;
        
        let materialCost = 0;
        if (inputProduct?.unit?.toLowerCase().startsWith('bag') && formData.input_bags > 0) {
            materialCost = formData.input_bags * inputRate;
        } else {
            materialCost = formData.input_quantity_kg * inputRate;
        }

        const labor = parseFloat(formData.labor_charge || 0);
        const other = parseFloat(formData.other_charges || 0);
        const totalCost = materialCost + labor + other;

        const totalOutputWeight = outputs.reduce((sum, o) => sum + parseFloat(o.quantity_kg || 0), 0);
        const totalMarketValue = outputs.reduce((sum, o) => sum + (parseFloat(o.quantity_kg || 0) * parseFloat(o.market_value || 0)), 0);

        const allocatedOutputs = outputs.map(item => {
            let allocated = 0;
            if (formData.costing_method === 'WEIGHT_PROPORTION' && totalOutputWeight > 0) {
                allocated = (parseFloat(item.quantity_kg || 0) / totalOutputWeight) * totalCost;
            } else if (formData.costing_method === 'MARKET_VALUE') {
                if (totalMarketValue > 0) {
                    allocated = ((parseFloat(item.quantity_kg || 0) * parseFloat(item.market_value || 0)) / totalMarketValue) * totalCost;
                } else if (totalOutputWeight > 0) {
                    allocated = (parseFloat(item.quantity_kg || 0) / totalOutputWeight) * totalCost;
                }
            }

            const costPerKg = item.quantity_kg > 0 ? (allocated / item.quantity_kg) : 0;
            const costPerUnit = item.bags > 0 ? (allocated / item.bags) : costPerKg;

            return {
                ...item,
                allocated,
                costPerKg,
                costPerUnit
            };
        });

        return {
            materialCost,
            totalCost,
            totalOutputWeight,
            totalMarketValue,
            allocatedOutputs
        };
    };

    const costSummary = getCostingSummary();

    // Database: Save Draft
    const handleSaveBatch = async (e) => {
        e.preventDefault();
        
        if (!formData.input_product_id || formData.input_quantity_kg <= 0) {
            return alert('Please select an input variety and enter quantity.');
        }

        setIsSubmitting(true);
        try {
            // 1. Insert header
            const { data: batch, error: headerErr } = await supabase
                .from('production_batches')
                .insert([{
                    batch_number: formData.batch_number,
                    process_type: formData.process_type,
                    production_date: formData.production_date,
                    costing_method: formData.costing_method,
                    labor_charge: parseFloat(formData.labor_charge || 0),
                    other_charges: parseFloat(formData.other_charges || 0),
                    status: 'DRAFT',
                    note: formData.note,
                    created_by: profile.id
                }])
                .select()
                .single();

            if (headerErr) throw headerErr;

            // 2. Insert input
            const inputProduct = products.find(p => p.id === formData.input_product_id);
            const { error: inErr } = await supabase
                .from('production_inputs')
                .insert([{
                    batch_id: batch.id,
                    product_id: formData.input_product_id,
                    bags: parseFloat(formData.input_bags || 0),
                    bag_weight: parseFloat(formData.input_bag_weight || 50),
                    quantity_kg: parseFloat(formData.input_quantity_kg || 0),
                    cost_price: parseFloat(inputProduct?.cost_price || 0)
                }]);

            if (inErr) throw inErr;

            // 3. Insert outputs
            const outputsPayload = outputs.map(item => ({
                batch_id: batch.id,
                product_id: item.product_id,
                bags: parseFloat(item.bags || 0),
                bag_weight: parseFloat(item.bag_weight || 50),
                quantity_kg: parseFloat(item.quantity_kg || 0),
                market_value: parseFloat(item.market_value || 0),
                configured_percentage: 0
            }));
            const { error: outErr } = await supabase.from('production_outputs').insert(outputsPayload);
            if (outErr) throw outErr;

            alert('Workflow batch successfully saved as DRAFT.');
            setIsModalOpen(false);
            fetchBatches();
        } catch (error) {
            console.error('Error saving batch:', error);
            alert('Failed to save batch: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // RPC: Complete Batch
    const handleCompleteBatch = async (batchId) => {
        if (!window.confirm('Are you sure you want to COMPLETE this production run? This will deduct raw stocks, add output stocks, update cost rates, and lock the record.')) return;
        
        setLoading(true);
        try {
            const { error } = await supabase.rpc('complete_production_batch', {
                p_batch_id: batchId,
                p_actor_id: profile.id
            });

            if (error) throw error;
            alert('Batch run finalized! Stock balances and costing rates updated successfully.');
            fetchBatches();
            if (expandedBatchId === batchId) {
                await fetchBatchSubItems(batchId);
            }
        } catch (error) {
            console.error('Error completing batch:', error);
            alert('Failed to complete batch: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // RPC: Revert Batch
    const handleRevertBatch = async (batchId) => {
        if (!window.confirm('WARNING: Are you sure you want to REVERT this batch run to DRAFT? This restores raw material stocks and deletes the produced stock adjustments.')) return;
        
        setLoading(true);
        try {
            const { error } = await supabase.rpc('revert_production_batch', {
                p_batch_id: batchId,
                p_actor_id: profile.id
            });

            if (error) throw error;
            alert('Batch run reverted back to editable DRAFT state.');
            fetchBatches();
            if (expandedBatchId === batchId) {
                await fetchBatchSubItems(batchId);
            }
        } catch (error) {
            console.error('Error reverting batch:', error);
            alert('Failed to revert batch: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Delete Batch
    const handleDeleteBatch = async (batchId) => {
        if (!window.confirm('Are you sure you want to delete this draft batch? This action is permanent.')) return;

        setLoading(true);
        try {
            const { error } = await supabase.from('production_batches').delete().eq('id', batchId);
            if (error) throw error;
            alert('Batch deleted.');
            fetchBatches();
            setExpandedBatchId(null);
        } catch (error) {
            console.error('Error deleting batch:', error);
            alert('Failed to delete batch: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredBatches = batches.filter(b => {
        const matchesSearch = b.batch_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (b.note && b.note.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesProcess = processFilter === 'ALL' || b.process_type === processFilter;
        const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;

        return matchesSearch && matchesProcess && matchesStatus;
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Production & Sorting Runs</h1>
                    <p className="text-muted">Simple workflow for logging milling yields and allocating output cost values.</p>
                </div>
                {isAccountsOrAdmin && (
                    <button className="btn btn-primary" onClick={handleOpenModal} style={{ gap: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        <Plus size={18} /> Record New Run
                    </button>
                )}
            </header>

            {/* Visual Stats Row */}
            <section className="stats-grid mb-6">
                <div className="stat-card glass-panel card-blue" style={{ padding: '1.25rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}><Scale size={20} /></div>
                    <div className="stat-info">
                        <div className="stat-value">{(stats.totalPaddyProcessed / 1000).toFixed(1)} MT</div>
                        <div className="stat-label">Paddy Milling Input</div>
                    </div>
                </div>
                <div className="stat-card glass-panel card-emerald" style={{ padding: '1.25rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><Sparkles size={20} /></div>
                    <div className="stat-info">
                        <div className="stat-value">{(stats.totalRiceProduced / 1000).toFixed(1)} MT</div>
                        <div className="stat-label">Total Refined Output</div>
                    </div>
                </div>
                <div className="stat-card glass-panel card-amber" style={{ padding: '1.25rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><CheckCircle size={20} /></div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.completedBatches}</div>
                        <div className="stat-label">Completed Runs</div>
                    </div>
                </div>
            </section>

            {/* Filter controls */}
            <section className="glass-panel mb-6" style={{ padding: '1.25rem' }}>
                <div className="form-grid-4" style={{ alignItems: 'flex-end', gap: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Search Run No</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', top: '10px', left: '10px', color: 'var(--color-text-muted)' }} />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search batch..."
                                style={{ paddingLeft: '2.2rem', fontSize: '0.85rem', height: '38px' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Process Type</label>
                        <select className="form-input" style={{ fontSize: '0.85rem', height: '38px' }} value={processFilter} onChange={(e) => setProcessFilter(e.target.value)}>
                            <option value="ALL">All Operations</option>
                            <option value="MILLING">Milling Runs</option>
                            <option value="SORTING">Sorting Runs</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Status</label>
                        <select className="form-input" style={{ fontSize: '0.85rem', height: '38px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="ALL">All Status</option>
                            <option value="DRAFT">Draft (Editable)</option>
                            <option value="COMPLETED">Completed (Locked)</option>
                        </select>
                    </div>
                    <div>
                        <button className="btn btn-secondary w-full" style={{ height: '38px', fontSize: '0.85rem' }} onClick={() => { setSearchTerm(''); setProcessFilter('ALL'); setStatusFilter('ALL'); }}>
                            Clear
                        </button>
                    </div>
                </div>
            </section>

            {/* Run List Table */}
            <section className="glass-panel">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Run No</th>
                                <th>Date</th>
                                <th>Operation</th>
                                <th>Material Transformation Flow</th>
                                <th className="text-right">Total Weight</th>
                                <th className="text-right">Total Cost</th>
                                <th>Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBatches.map(batch => {
                                const isExpanded = expandedBatchId === batch.id;
                                return (
                                    <React.Fragment key={batch.id}>
                                        <tr style={{ cursor: 'pointer', background: isExpanded ? 'rgba(59, 130, 246, 0.02)' : 'transparent' }} onClick={() => handleRowExpand(batch.id)}>
                                            <td className="font-bold text-primary">{batch.batch_number}</td>
                                            <td>{new Date(batch.production_date).toLocaleDateString()}</td>
                                            <td>
                                                <span className="status-badge" style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: '600',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    background: batch.process_type === 'MILLING' ? 'rgba(236, 72, 153, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                                    color: batch.process_type === 'MILLING' ? '#ec4899' : '#8b5cf6',
                                                    border: batch.process_type === 'MILLING' ? '1px solid rgba(236, 72, 153, 0.2)' : '1px solid rgba(139, 92, 246, 0.2)'
                                                }}>
                                                    {batch.process_type === 'MILLING' ? 'Milling' : 'Sorting'}
                                                </span>
                                            </td>
                                            <td>
                                                {/* Visual Flow diagram for quick overview */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                    <span className="font-semibold" style={{ color: '#ef4444' }}>
                                                        {batch.process_type === 'MILLING' ? 'Paddy' : 'Unsorted'}
                                                    </span>
                                                    <ArrowRight size={12} className="text-muted" />
                                                    <span className="font-semibold" style={{ color: '#10b981' }}>
                                                        {batch.process_type === 'MILLING' ? 'Rice + Byproducts' : 'Refined Premium'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="text-right font-medium">{parseFloat(batch.total_input_weight).toLocaleString()} kg</td>
                                            <td className="text-right font-bold">৳ {parseFloat(batch.total_input_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td>
                                                <span className={`status-badge ${batch.status === 'COMPLETED' ? 'status-paid' : 'status-draft'}`} style={{ fontSize: '0.7rem' }}>
                                                    {batch.status}
                                                </span>
                                            </td>
                                            <td className="text-right" onClick={e => e.stopPropagation()}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button className="btn-icon text-primary" title="View Details" onClick={() => handleRowExpand(batch.id)}>
                                                        <Eye size={16} />
                                                    </button>
                                                    {batch.status === 'DRAFT' && isAccountsOrAdmin && (
                                                        <button className="btn-icon text-success" title="Lock & Complete Run" onClick={() => handleCompleteBatch(batch.id)}>
                                                            <CheckCircle size={16} />
                                                        </button>
                                                    )}
                                                    {batch.status === 'COMPLETED' && isAdmin && (
                                                        <button className="btn-icon text-amber" title="Revert to Draft" onClick={() => handleRevertBatch(batch.id)}>
                                                            <RotateCcw size={16} />
                                                        </button>
                                                    )}
                                                    {batch.status === 'DRAFT' && isAccountsOrAdmin && (
                                                        <button className="btn-icon text-danger" title="Delete Draft" onClick={() => handleDeleteBatch(batch.id)}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        
                                        {/* Simple Visual Material Flow breakdown */}
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan="8" style={{ padding: '1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                    {detailsLoading ? (
                                                        <div style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Loading details...</div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Run Flow Breakdown</span>
                                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                                    Costing Allocation Method: <strong>{batch.costing_method.replace(/_/g, ' ')}</strong>
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1.5fr', alignItems: 'center', gap: '1.5rem' }}>
                                                                {/* Consumed material */}
                                                                <div className="glass-panel" style={{ padding: '0.75rem', background: '#fff' }}>
                                                                    <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Input Raw Material</div>
                                                                    {batchDetails.inputs.map(input => (
                                                                        <div key={input.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                                            <span className="font-medium">{input.product?.name}</span>
                                                                            <strong>{parseFloat(input.bags).toFixed(1)} Bags ({parseFloat(input.quantity_kg).toLocaleString()} kg)</strong>
                                                                        </div>
                                                                    ))}
                                                                    <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: '6px', paddingTop: '4px', fontSize: '0.75rem', color: '#6b7280' }}>
                                                                        <div>Labor/Operating charges: ৳ {parseFloat(batch.labor_charge).toLocaleString()}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Connector */}
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                    <ArrowRight size={20} className="text-primary" />
                                                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                                                        {((batch.total_output_weight / batch.total_input_weight) * 100).toFixed(0)}% Yield
                                                                    </span>
                                                                </div>

                                                                {/* Produced Materials */}
                                                                <div className="glass-panel" style={{ padding: '0.75rem', background: '#fff' }}>
                                                                    <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>Produced Output Yields</div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                        {batchDetails.outputs.map(output => (
                                                                            <div key={output.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                                                <span style={{ color: '#0f766e' }} className="font-medium">{output.product?.name}</span>
                                                                                <span style={{ fontSize: '0.8rem' }}>
                                                                                    {parseFloat(output.bags).toFixed(1)} Bags ({parseFloat(output.quantity_kg).toLocaleString()} kg)
                                                                                    <span style={{ marginLeft: '10px', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                                                                        ৳ {parseFloat(output.allocated_cost).toLocaleString()}
                                                                                    </span>
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {batch.note && (
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                                                    * Note: {batch.note}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {filteredBatches.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No production batches logged. Add a run to begin tracking stock transformations!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Record Production Batch Modal (Step-by-Step Wizard) */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '650px', borderRadius: '12px' }}>
                        <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Record Material Transformation</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={18} /></button>
                        </div>
                        
                        {/* Wizard Progress Steps Indicator */}
                        <div style={{ display: 'flex', background: '#f8fafc', padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f5f9', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: wizardStep === 1 ? 'bold' : 'normal', color: wizardStep === 1 ? 'var(--color-primary)' : '#64748b' }}>
                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: wizardStep >= 1 ? 'var(--color-primary)' : '#cbd5e1', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>1</span>
                                Choose Process
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: wizardStep === 2 ? 'bold' : 'normal', color: wizardStep === 2 ? 'var(--color-primary)' : '#64748b' }}>
                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: wizardStep >= 2 ? 'var(--color-primary)' : '#cbd5e1', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>2</span>
                                Input Quantity
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: wizardStep === 3 ? 'bold' : 'normal', color: wizardStep === 3 ? 'var(--color-primary)' : '#64748b' }}>
                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: wizardStep >= 3 ? 'var(--color-primary)' : '#cbd5e1', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>3</span>
                                Costing & Confirm
                            </div>
                        </div>

                        <div className="modal-body" style={{ padding: '1.5rem' }}>
                            <form onSubmit={handleSaveBatch}>
                                
                                {/* STEP 1: Select Operation Process */}
                                {wizardStep === 1 && (
                                    <div>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '1rem', color: '#0f172a' }}>What operation are you recording today?</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            {/* Milling Option Card */}
                                            <div 
                                                onClick={() => handleProcessSelect('MILLING')}
                                                style={{ 
                                                    padding: '1.5rem', 
                                                    borderRadius: '8px', 
                                                    border: '2px solid #e2e8f0', 
                                                    cursor: 'pointer', 
                                                    transition: 'all 0.2s',
                                                    textAlign: 'center',
                                                    background: '#fff'
                                                }}
                                                className="card-hover-highlight"
                                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                            >
                                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🌾</div>
                                                <h4 style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>Paddy Milling Run</h4>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                    Process Raw Paddy to produce Unsorted Rice, Bran, Husk, and Broken stocks.
                                                </p>
                                            </div>

                                            {/* Sorting Option Card */}
                                            <div 
                                                onClick={() => handleProcessSelect('SORTING')}
                                                style={{ 
                                                    padding: '1.5rem', 
                                                    borderRadius: '8px', 
                                                    border: '2px solid #e2e8f0', 
                                                    cursor: 'pointer', 
                                                    transition: 'all 0.2s',
                                                    textAlign: 'center',
                                                    background: '#fff'
                                                }}
                                                className="card-hover-highlight"
                                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                            >
                                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✨</div>
                                                <h4 style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>Rice Sorting Run</h4>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                    Refine Unsorted Rice to produce Premium Rice, Khud, Mora, Grader, and Loose stocks.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: Input weight and auto-ratio outputs calculations */}
                                {wizardStep === 2 && (
                                    <div>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '1rem', color: '#0f172a' }}>
                                            Enter the {formData.process_type === 'MILLING' ? 'Paddy' : 'Unsorted Rice'} quantity consumed:
                                        </h3>
                                        
                                        <div className="form-grid-2 mb-4">
                                            <div className="form-group">
                                                <label className="form-label">Variety Consumed *</label>
                                                <select
                                                    className="form-input"
                                                    value={formData.input_product_id}
                                                    onChange={(e) => setFormData({ ...formData, input_product_id: e.target.value })}
                                                    required
                                                >
                                                    <option value="">-- Choose Inventory Product --</option>
                                                    {products
                                                        .filter(p => formData.process_type === 'MILLING' 
                                                            ? p.inventory_type === 'RAW_MATERIAL' 
                                                            : p.inventory_type === 'SEMI_FINISHED' || (p.inventory_type === 'RAW_MATERIAL' && p.name.toLowerCase().includes('unsorted')))
                                                        .map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.current_stock} {p.unit})</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Total Weight in KG *</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    placeholder="e.g. 1000"
                                                    value={formData.input_quantity_kg}
                                                    onChange={(e) => handleInputQuantityChange('input_quantity_kg', parseFloat(e.target.value) || 0)}
                                                    required
                                                    min="1"
                                                />
                                            </div>
                                        </div>

                                        <div className="form-grid-3 mb-4">
                                            <div className="form-group">
                                                <label className="form-label">Bags Count</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={formData.input_bags}
                                                    onChange={(e) => handleInputQuantityChange('input_bags', parseFloat(e.target.value) || 0)}
                                                    step="0.01"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Bag Weight (KG)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={formData.input_bag_weight}
                                                    onChange={(e) => handleInputQuantityChange('input_bag_weight', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Production Date</label>
                                                <input
                                                    type="date"
                                                    className="form-input"
                                                    value={formData.production_date}
                                                    onChange={(e) => setFormData({ ...formData, production_date: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Auto Yield Outputs Display */}
                                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                                            <h4 style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Sparkles size={16} className="text-success" /> Automatically Calculated Yields (Can tweak weights if needed):
                                            </h4>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '0.5rem', fontWeight: 'bold', fontSize: '0.75rem', marginBottom: '0.25rem', color: '#64748b' }}>
                                                <div>Produced Variety</div>
                                                <div className="text-right">Bags</div>
                                                <div className="text-right">Weight (KG)</div>
                                                <div></div>
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {outputs.map((item, idx) => (
                                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '0.5rem', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.8rem', color: '#0f172a' }}>{item.name}</span>
                                                        <input
                                                            type="number"
                                                            className="form-input text-right"
                                                            style={{ fontSize: '0.8rem', padding: '2px 4px', height: '28px' }}
                                                            value={parseFloat(item.bags.toFixed(1))}
                                                            onChange={(e) => handleOutputFieldChange(idx, 'bags', parseFloat(e.target.value) || 0)}
                                                            step="0.1"
                                                        />
                                                        <input
                                                            type="number"
                                                            className="form-input text-right"
                                                            style={{ fontSize: '0.8rem', padding: '2px 4px', height: '28px' }}
                                                            value={parseFloat(item.quantity_kg.toFixed(1))}
                                                            onChange={(e) => handleOutputFieldChange(idx, 'quantity_kg', parseFloat(e.target.value) || 0)}
                                                            step="0.1"
                                                        />
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', paddingLeft: '4px' }}>kg</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                                            <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(1)} style={{ gap: '4px', display: 'flex', alignItems: 'center' }}>
                                                <ChevronLeft size={16} /> Back
                                            </button>
                                            <button type="button" className="btn btn-primary" onClick={() => setWizardStep(3)} style={{ gap: '4px', display: 'flex', alignItems: 'center' }}>
                                                Next: Costing <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3: labor/other charges and costing preview */}
                                {wizardStep === 3 && (
                                    <div>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '1rem', color: '#0f172a' }}>
                                            Operating Expenses & Cost Allocation:
                                        </h3>

                                        <div className="form-grid-3 mb-4">
                                            <div className="form-group">
                                                <label className="form-label">Labor Charge (৳)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={formData.labor_charge || ''}
                                                    onChange={(e) => setFormData({ ...formData, labor_charge: parseFloat(e.target.value) || 0 })}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Other Charges (৳)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={formData.other_charges || ''}
                                                    onChange={(e) => setFormData({ ...formData, other_charges: parseFloat(e.target.value) || 0 })}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Costing Logic</label>
                                                <select
                                                    className="form-input"
                                                    value={formData.costing_method}
                                                    onChange={(e) => setFormData({ ...formData, costing_method: e.target.value })}
                                                >
                                                    <option value="WEIGHT_PROPORTION">By Output Weight</option>
                                                    <option value="MARKET_VALUE">By Output Market Price</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Costing allocations preview box */}
                                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                                <span>Material Cost:</span>
                                                <span>৳ {costSummary.materialCost.toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                                <span>Expenses (Labor & Other):</span>
                                                <span>+ ৳ {(formData.labor_charge + formData.other_charges).toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 'bold', borderTop: '1px solid #cbd5e1', paddingTop: '6px', marginBottom: '10px' }}>
                                                <span>Total Cost to Allocate:</span>
                                                <span className="text-primary">৳ {costSummary.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>

                                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Cost Allocations:</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                {costSummary.allocatedOutputs.map((item, idx) => {
                                                    const prod = products.find(p => p.id === item.product_id);
                                                    return (
                                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                                            <span style={{ color: '#0f766e' }}>{item.name}</span>
                                                            <strong>
                                                                ৳ {parseFloat(item.costPerUnit || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} / {prod?.unit || 'KG'}
                                                                <span style={{ color: '#94a3b8', marginLeft: '6px', fontWeight: 'normal' }}>
                                                                    (Total: ৳ {parseInt(item.allocated).toLocaleString()})
                                                                </span>
                                                            </strong>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="form-group mb-4">
                                            <label className="form-label">Note / References</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="e.g. Standard mill run"
                                                value={formData.note}
                                                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                            />
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                                            <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(2)} style={{ gap: '4px', display: 'flex', alignItems: 'center' }}>
                                                <ChevronLeft size={16} /> Back
                                            </button>
                                            <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ gap: '4px', display: 'flex', alignItems: 'center' }}>
                                                {isSubmitting ? 'Saving...' : 'Save Draft Batch'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductionBatches;
