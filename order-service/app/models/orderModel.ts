import { DataTypes, type Model, type Sequelize } from "sequelize";
import {
  ORDER_STATUSES,
  type OrderAttributes,
  type OrderCreationAttributes,
} from "./types.ts";

export interface OrderInstance
  extends Model<OrderAttributes, OrderCreationAttributes>,
    OrderAttributes {}

export default (sequelize: Sequelize) =>
  sequelize.define<OrderInstance>(
    "order",
    {
      order_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      requester_id: { type: DataTypes.STRING, allowNull: false },
      courier_id: { type: DataTypes.STRING },
      status: {
        type: DataTypes.ENUM(...ORDER_STATUSES),
        allowNull: false,
        defaultValue: "OPEN",
      },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING, allowNull: false, defaultValue: "" },
      supplier_id: { type: DataTypes.STRING, allowNull: false },
      delivery_location: { type: DataTypes.STRING, allowNull: false },
      credit_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1 },
      },
      accept_by: { type: DataTypes.DATE, allowNull: false },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      accepted_at: { type: DataTypes.DATE },
      picked_up_at: { type: DataTypes.DATE },
      completed_at: { type: DataTypes.DATE },
      cancelled_at: { type: DataTypes.DATE },
      expired_at: { type: DataTypes.DATE },
    },
    {
      tableName: "orders",
      timestamps: false,
      indexes: [
        { name: "orders_status_accept_by_idx", fields: ["status", "accept_by"] },
        { name: "orders_requester_idx", fields: ["requester_id"] },
        { name: "orders_courier_idx", fields: ["courier_id"] },
      ],
    }
  );