import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {type INotificationService} from '../notifications.port.js';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import { DAY_MILLESECONDS } from '@/constants.js';

export class ProductService {
	private readonly ns: INotificationService;
	private readonly db: Database;

	public constructor({ns, db}: Pick<Cradle, 'ns' | 'db'>) {
		this.ns = ns;
		this.db = db;
	}

	public async notifyDelay(leadTime: number, p: Product): Promise<void> {
		const { id, leadTime : productLeadTime, name} = p || {};
		p.leadTime = leadTime;
		await this.db.update(products).set(p).where(eq(products.id, id));
		this.ns.sendDelayNotification(productLeadTime, name);
	}

	public async handleSeasonalProduct(p: Product): Promise<void> {
		const currentDate = new Date();
		const {id, leadTime, seasonStartDate, seasonEndDate, name, available} = p || {};
		const dateAfterLead = new Date(currentDate.getTime() + (leadTime * DAY_MILLESECONDS));
		if (( dateAfterLead > seasonStartDate!) && (dateAfterLead < seasonEndDate!) && (available > 0)) {
			p.available -= 1;
			await this.db.update(products).set(p).where(eq(products.id, id));
		}
		else if (dateAfterLead > seasonEndDate!) {
			p.available = 0;
			await this.db.update(products).set(p).where(eq(products.id, id));
			this.ns.sendOutOfStockNotification(name);
		} else if (seasonStartDate! > dateAfterLead) {
			p.available = 0;
			await this.db.update(products).set(p).where(eq(products.id, id));
			this.ns.sendOutOfStockNotification(name);
		} else {
			await this.notifyDelay(leadTime, p);
		}
	}

	public async handleExpiredProduct(p: Product): Promise<void> {
		const {id, expiryDate, available, name} = p || {};
		const currentDate = new Date();
		if (available > 0 && expiryDate! > currentDate) {
			p.available -= 1;
			await this.db.update(products).set(p).where(eq(products.id, id));
		} else {
			p.available = 0;
			await this.db.update(products).set(p).where(eq(products.id, id));
			this.ns.sendExpirationNotification(name, expiryDate!);
		}
	}

	public async handleProductAvailability(p: Product): Promise<void> {
		const {id, available, name, leadTime} = p;
		if (leadTime > 0) {
			p.available = 0;
			await this.db.update(products).set(p).where(eq(products.id, id));
			await this.notifyDelay(leadTime, p);
		} else if (available > 0) {
			p.available -= 1;
			await this.db.update(products).set(p).where(eq(products.id, id));
		} else {
			await this.ns.sendOutOfStockNotification(name);
		}
	}
}
